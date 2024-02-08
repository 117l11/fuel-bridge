use crate::database::{
    storage::DatabaseColumn, Column, Database, Error as DatabaseError, Result as DatabaseResult,
};
use fuel_core_chain_config::ContractConfig;
use fuel_core_storage::{
    iter::IterDirection,
    tables::{ContractsInfo, ContractsLatestUtxo, ContractsRawCode},
    ContractsAssetKey, Error as StorageError, Mappable, Result as StorageResult, StorageAsRef,
    StorageInspect, StorageMutate, StorageRead, StorageSize, StorageWrite,
};
use fuel_core_types::{
    entities::contract::ContractUtxoInfo,
    fuel_tx::Contract,
    fuel_types::{AssetId, Bytes32, ContractId, Word},
};
use std::borrow::Cow;

impl DatabaseColumn for ContractsLatestUtxo {
    fn column() -> Column {
        Column::ContractsLatestUtxo
    }
}

impl StorageInspect<ContractsRawCode> for Database {
    type Error = StorageError;

    fn get(
        &self,
        key: &<ContractsRawCode as Mappable>::Key,
    ) -> Result<Option<Cow<<ContractsRawCode as Mappable>::OwnedValue>>, Self::Error> {
        Ok(self
            .read_alloc(key.as_ref(), Column::ContractsRawCode)?
            .map(|v| Cow::Owned(Contract::from(v))))
    }

    fn contains_key(&self, key: &<ContractsRawCode as Mappable>::Key) -> Result<bool, Self::Error> {
        self.contains_key(key.as_ref(), Column::ContractsRawCode)
            .map_err(Into::into)
    }
}

// # Dev-note: The value of the `ContractsRawCode` has a unique implementation of serialization
// and deserialization. Because the value is a contract byte code represented by bytes,
// we don't use `serde::Deserialization` and `serde::Serialization` for `Vec`, because we don't
// need to store the size of the contract. We store/load raw bytes.
impl StorageMutate<ContractsRawCode> for Database {
    fn insert(
        &mut self,
        key: &<ContractsRawCode as Mappable>::Key,
        value: &<ContractsRawCode as Mappable>::Value,
    ) -> Result<Option<<ContractsRawCode as Mappable>::OwnedValue>, Self::Error> {
        let existing = Database::replace(self, key.as_ref(), Column::ContractsRawCode, value)?;
        Ok(existing.1.map(Contract::from))
    }

    fn remove(
        &mut self,
        key: &<ContractsRawCode as Mappable>::Key,
    ) -> Result<Option<<ContractsRawCode as Mappable>::OwnedValue>, Self::Error> {
        Ok(<Self as StorageWrite<ContractsRawCode>>::take(self, key)?.map(Contract::from))
    }
}

impl StorageSize<ContractsRawCode> for Database {
    fn size_of_value(&self, key: &ContractId) -> Result<Option<usize>, Self::Error> {
        Ok(self.size_of_value(key.as_ref(), Column::ContractsRawCode)?)
    }
}

impl StorageRead<ContractsRawCode> for Database {
    fn read(&self, key: &ContractId, buf: &mut [u8]) -> Result<Option<usize>, Self::Error> {
        Ok(self.read(key.as_ref(), Column::ContractsRawCode, buf)?)
    }

    fn read_alloc(&self, key: &ContractId) -> Result<Option<Vec<u8>>, Self::Error> {
        Ok(self.read_alloc(key.as_ref(), Column::ContractsRawCode)?)
    }
}

impl StorageWrite<ContractsRawCode> for Database {
    fn write(&mut self, key: &ContractId, buf: Vec<u8>) -> Result<usize, Self::Error> {
        Ok(Database::write(
            self,
            key.as_ref(),
            Column::ContractsRawCode,
            &buf,
        )?)
    }

    fn replace(
        &mut self,
        key: &<ContractsRawCode as Mappable>::Key,
        buf: Vec<u8>,
    ) -> Result<(usize, Option<Vec<u8>>), <Self as StorageInspect<ContractsRawCode>>::Error>
    where
        Self: StorageSize<ContractsRawCode>,
    {
        Ok(Database::replace(
            self,
            key.as_ref(),
            Column::ContractsRawCode,
            &buf,
        )?)
    }

    fn take(
        &mut self,
        key: &<ContractsRawCode as Mappable>::Key,
    ) -> Result<Option<Vec<u8>>, Self::Error> {
        Ok(Database::take(
            self,
            key.as_ref(),
            Column::ContractsRawCode,
        )?)
    }
}

impl Database {
    pub fn get_contract_config_by_id(
        &self,
        contract_id: ContractId,
    ) -> StorageResult<ContractConfig> {
        let code: Vec<u8> = self
            .storage::<ContractsRawCode>()
            .get(&contract_id)?
            .unwrap()
            .into_owned()
            .into();

        let (salt, _) = self
            .storage::<ContractsInfo>()
            .get(&contract_id)
            .unwrap()
            .expect("Contract does not exist")
            .into_owned();

        let ContractUtxoInfo {
            utxo_id,
            tx_pointer,
        } = self
            .storage::<ContractsLatestUtxo>()
            .get(&contract_id)
            .unwrap()
            .expect("contract does not exist")
            .into_owned();

        let state = Some(
            self.iter_all_by_prefix::<Vec<u8>, Bytes32, _>(
                Column::ContractsState,
                Some(contract_id.as_ref()),
            )
            .map(|res| -> DatabaseResult<(Bytes32, Bytes32)> {
                let safe_res = res?;

                // We don't need to store ContractId which is the first 32 bytes of this
                // key, as this Vec is already attached to that ContractId
                let state_key = Bytes32::new(safe_res.0[32..].try_into()?);

                Ok((state_key, safe_res.1))
            })
            .filter(|val| val.is_ok())
            .collect::<DatabaseResult<Vec<(Bytes32, Bytes32)>>>()?,
        );

        let balances = Some(
            self.iter_all_by_prefix::<Vec<u8>, u64, _>(
                Column::ContractsAssets,
                Some(contract_id.as_ref()),
            )
            .map(|res| {
                let safe_res = res?;

                let asset_id =
                    AssetId::new(safe_res.0[32..].try_into().map_err(DatabaseError::from)?);

                Ok((asset_id, safe_res.1))
            })
            .filter(|val| val.is_ok())
            .collect::<StorageResult<Vec<(AssetId, u64)>>>()?,
        );

        Ok(ContractConfig {
            contract_id,
            code,
            salt,
            state,
            balances,
            tx_id: Some(*utxo_id.tx_id()),
            output_index: Some(utxo_id.output_index()),
            tx_pointer_block_height: Some(tx_pointer.block_height()),
            tx_pointer_tx_idx: Some(tx_pointer.tx_index()),
        })
    }

    pub fn contract_balances(
        &self,
        contract: ContractId,
        start_asset: Option<AssetId>,
        direction: Option<IterDirection>,
    ) -> impl Iterator<Item = DatabaseResult<(AssetId, Word)>> + '_ {
        self.iter_all_filtered::<Vec<u8>, Word, _, _>(
            Column::ContractsAssets,
            Some(contract),
            start_asset.map(|asset_id| ContractsAssetKey::new(&contract, &asset_id)),
            direction,
        )
        .map(|res| res.map(|(key, balance)| (AssetId::new(key[32..].try_into().unwrap()), balance)))
    }

    pub fn get_contract_config(&self) -> StorageResult<Option<Vec<ContractConfig>>> {
        let configs = self
            .iter_all::<Vec<u8>, Word>(Column::ContractsRawCode, None)
            .map(|raw_contract_id| -> StorageResult<ContractConfig> {
                let contract_id = ContractId::new(
                    raw_contract_id.unwrap().0[..32]
                        .try_into()
                        .map_err(DatabaseError::from)?,
                );
                self.get_contract_config_by_id(contract_id)
            })
            .collect::<StorageResult<Vec<ContractConfig>>>()?;

        Ok(Some(configs))
    }
}
