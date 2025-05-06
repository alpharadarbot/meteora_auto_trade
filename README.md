# meteora_auto_trade

# DLMM SDK 使用說明

## 專案結構
- `dlmm-sdk/python-client/dlmm`: Python 客戶端代碼
- `dlmm-sdk/ts-client`: TypeScript 客戶端代碼

## 安裝步驟

### 1. 啟動 TypeScript 服務
```bash
cd ts-client
npm install
npx tsc && node dist/src/server/index.js
```
這將啟動一個運行在 localhost:3000 的服務。

### 2. 設定 Python 環境
1. 將 `example.env` 重命名為 `.env`
2. 在 `.env` 中填入要執行自動交易的 Solana 錢包私鑰
3. 在 `main_trade.py` 中填入正確的 `helius_api_key`

### 3. 配置 main_trade.py
```python
BIN_RANGE = 6  # 加流動性的 bin range
POOL_ADDRESS = "9d9mb8kooFfaD3SctgZtkxQypkshx6ezhbKio89ixyy2"  # USDC pool
TOTAL_INVESTMENT_USDC = 10  # USDC 交易金額 (用於 Token/USDC 交易對)
TOTAL_INVESTMENT_SOL = 0.001  # SOL 交易金額 (用於 Token/SOL 交易對)
```

## 注意事項
1. 錢包需要至少有 0.1 SOL 才能正常執行
2. 交易策略:
   - 總投資金額的一半用於 token swap
   - 另一半用於與 token 加流動性 (Meteora 不要求 1:1 比例)

## 交易監控
系統每 60 秒會執行一次 `execute_trading_strategy` 檢查:
1. 是否在過去 600 秒內沒有任何交易
2. 總獎勵是否超過 20,000 token

## 執行交易
設定完成後，執行:
```bash
python main_trade.py
```

## 系統要求
- Node.js 環境 (用於 TypeScript 服務)
- Python 環境
- Solana 錢包
- Helius API key