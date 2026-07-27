# 本机量化实验室（quant_lab）

从云端 `quant-data-factory` rsync Parquet 后，在本机做查询、因子与回测。

```bash
export QUANT_CLOUD=root@CLOUD_IP
./sync.sh
python examples/duckdb_smoke.py
python backtest/sample_ma_cross.py
```

云端部署见 [`../quant-data-factory/README.md`](../quant-data-factory/README.md)。
