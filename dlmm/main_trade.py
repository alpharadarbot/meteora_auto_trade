import logging
from typing import Optional, Tuple, Dict, List
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solana.rpc.api import Client
from solana.transaction import Transaction
from dlmm.dlmm import DLMM
from dlmm.types import GetPositionByUser, StrategyType, SwapQuote, StrategyParameters, Position
import time
from spl.token.instructions import get_associated_token_address, create_associated_token_account, transfer
from spl.token.constants import TOKEN_PROGRAM_ID
import json
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv
import base58
import traceback
from solders.instruction import Instruction, AccountMeta
from solders.system_program import TransferParams, transfer
import math  # 添加在文件開頭的 import 部分
from logging.handlers import TimedRotatingFileHandler
from solders.compute_budget import set_compute_unit_limit, set_compute_unit_price
from solana.rpc.commitment import Confirmed
from solana.rpc.types import TxOpts

# 創建 logs 目錄（如果不存在）
log_dir = "logs"
if not os.path.exists(log_dir):
    os.makedirs(log_dir)

# 設置日誌格式
log_format = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')

# 設置日誌文件名（使用日期）
log_file = os.path.join(log_dir, f"dlmm_trader.log")

# 創建 file handler（每天輪換）
file_handler = TimedRotatingFileHandler(
    log_file,
    when="midnight",
    interval=1,
    backupCount=30  # 保留30天的日誌
)
file_handler.setFormatter(log_format)
file_handler.suffix = "%Y%m%d"  # 日誌文件後綴格式

# 創建 console handler
console_handler = logging.StreamHandler()
console_handler.setFormatter(log_format)

# 配置 root logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)
logger.addHandler(file_handler)
logger.addHandler(console_handler)

# 移除之前的基礎配置（如果有的話）
for handler in logger.handlers[:]:
    if isinstance(handler, logging.StreamHandler) and handler != console_handler:
        logger.removeHandler(handler)

# 添加一個啟動標記到日誌
logger.info("="*50)
logger.info(f"Starting new trading session at {datetime.now()}")
logger.info("="*50)

# 添加 WRAPPED_SOL_MINT 常量
WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112"

# 添加 COMPUTE_BUDGET_ID 常量
COMPUTE_BUDGET_ID = Pubkey.from_string("ComputeBudget111111111111111111111111111111")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def create_sync_native_instruction(native_account: Pubkey) -> Instruction:
    """創建同步原生代幣指令"""
    keys = [
        AccountMeta(pubkey=native_account, is_signer=False, is_writable=True)
    ]
    
    # SyncNative instruction discriminator
    data = bytes([17])
    
    return Instruction(
        program_id=TOKEN_PROGRAM_ID,
        accounts=keys,
        data=data
    )

class DLMMTrader:
    def __init__(self, pool_address: str, rpc_url: str, wallet: Keypair, 
                 total_investment_usdc: float, total_investment_sol: float):
        """
        初始化 DLMM 交易者
        
        Args:
            pool_address: DLMM 池的地址
            rpc_url: Solana RPC URL
            wallet: 用戶錢包
            total_investment_usdc: 最大 USDC 投資額
            total_investment_sol: 最大 SOL 投資額
        """
        try:
            self.pool_address = Pubkey.from_string(pool_address)
            self.rpc_url = rpc_url
            self.wallet = wallet
            self.client = Client(rpc_url)
            
            # 初始化 DLMM client
            try:
                logger.info(f"Creating DLMM instance for pool: {pool_address}")
                self.dlmm = DLMM(self.pool_address, rpc_url)
                if not self.dlmm:
                    raise ValueError("Failed to create DLMM instance")
                logger.info("DLMM instance created successfully")
            except Exception as e:
                logger.error(f"Failed to create DLMM instance: {str(e)}")
                raise
            
            self.position_history: Dict[str, Dict] = {}
            self.total_investment_usdc = total_investment_usdc
            self.total_investment_sol = total_investment_sol
            
            # USDC 和 SOL 的公鑰
            self.USDC_PUBKEY = Pubkey.from_string("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")  # Mainnet USDC
            self.SOL_PUBKEY = Pubkey.from_string("So11111111111111111111111111111111111111112")    # Wrapped SOL
            
            # 檢查 DLMM 初始化是否成功
            if hasattr(self.dlmm, 'token_X') and hasattr(self.dlmm, 'token_Y'):
                logger.info("=== Pool Token Information ===")
                logger.info(f"Token X: {self.dlmm.token_X.public_key} (decimals: {self.dlmm.token_X.decimal})")
                logger.info(f"Token Y: {self.dlmm.token_Y.public_key} (decimals: {self.dlmm.token_Y.decimal})")
                
                # 檢查並記錄池子類型
                self.pool_type = self._determine_pool_type()
                logger.info(f"Pool type: {self.pool_type}")
            else:
                raise ValueError("DLMM initialization incomplete - missing token information")
            
        except Exception as e:
            logger.error(f"Failed to initialize DLMMTrader: {e}")
            raise

    def _determine_pool_type(self) -> str:
        """
        確定流動性池的類型
        Returns: 'USDC', 'SOL', 或 'UNSUPPORTED'
        """
        token_x = self.dlmm.token_X.public_key
        token_y = self.dlmm.token_Y.public_key
        
        if token_x == self.USDC_PUBKEY or token_y == self.USDC_PUBKEY:
            return 'USDC'
        elif token_x == self.SOL_PUBKEY or token_y == self.SOL_PUBKEY:
            return 'SOL'
        else:
            return 'UNSUPPORTED'

    def get_investment_amount(self) -> Optional[float]:
        """
        根據池子類型返回投資金額
        Returns: 投資金額或 None（如果不支持）
        """
        if self.pool_type == 'USDC':
            return self.total_investment_usdc
        elif self.pool_type == 'SOL':
            return self.total_investment_sol
        return None

    def check_sol_balance(self) -> bool:
        """
        檢查 SOL 餘額是否足夠支付交易費用
        """
        try:
            balance = self.client.get_balance(self.wallet.pubkey())
            sol_balance = (balance.value if hasattr(balance, 'value') else int(balance['result']['value'])) / 1e9
            logger.info(f"SOL balance: {sol_balance}")
            
            # 確保有足夠的 SOL 支付交易費用
            MIN_SOL = 0.1  # 最小需要 0.1 SOL
            if sol_balance < MIN_SOL:
                logger.error(f"Insufficient SOL balance. Need at least {MIN_SOL} SOL, but only have {sol_balance} SOL")
                return False
            
            return True
        except Exception as e:
            logger.error(f"Error checking SOL balance: {str(e)}")
            return False

    def get_token_balance(self, token_mint: Pubkey) -> int:
        """
        獲取指定代幣的餘額
        """
        try:
            # 如果是 SOL/WSOL
            if token_mint == self.SOL_PUBKEY or token_mint == Pubkey.from_string(WRAPPED_SOL_MINT):
                balance = self.client.get_balance(self.wallet.pubkey())
                if hasattr(balance, 'value'):
                    return balance.value
                return int(balance['result']['value'])
            
            # 其他代幣
            ata = get_associated_token_address(self.wallet.pubkey(), token_mint)
            try:
                balance = self.client.get_token_account_balance(ata)
                if hasattr(balance, 'value'):
                    return int(balance.value.amount)
                elif isinstance(balance, dict) and 'result' in balance:
                    return int(balance['result']['value']['amount'])
                else:
                    logger.warning(f"Unexpected balance format: {balance}")
                    return 0
            except Exception as e:
                if "could not find account" in str(e):
                    logger.info(f"Token account {ata} does not exist")
                    return 0
                raise

        except Exception as e:
            logger.error(f"Error getting token balance: {str(e)}")
            return 0

    def swap_tokens(self, amount: int, is_y_to_x: bool) -> bool:
        """執行代幣交換"""
        try:
            logger.info(f"Swapping {'Y->X' if is_y_to_x else 'X->Y'}, amount: {amount}")
            
            # 檢查 SOL 餘額
            if not self.check_sol_balance():
                logger.error("Insufficient SOL balance")
                return False

            # 檢查代幣餘額
            from_token = self.dlmm.token_Y if is_y_to_x else self.dlmm.token_X
            to_token = self.dlmm.token_X if is_y_to_x else self.dlmm.token_Y
            
            from_ata = get_associated_token_address(self.wallet.pubkey(), from_token.public_key)
            to_ata = get_associated_token_address(self.wallet.pubkey(), to_token.public_key)
            
            # 檢查初始餘額
            try:
                # 如果是 SOL/WSOL
                if from_token.public_key == self.SOL_PUBKEY:
                    balance = self.client.get_balance(self.wallet.pubkey())
                    initial_balance = balance.value
                    logger.info(f"Initial SOL balance: {initial_balance / 1e9} SOL")
                else:
                    try:
                        balance = self.client.get_token_account_balance(from_ata)
                        initial_balance = int(balance.value.amount)
                        logger.info(f"Initial balance for token {from_token.public_key}: {initial_balance}")
                    except Exception as e:
                        if "could not find account" in str(e):
                            logger.error(f"Token account {from_ata} does not exist")
                            return False
                        raise
            except Exception as e:
                logger.error(f"Failed to get initial balance: {str(e)}")
                return False

            try:
                # 獲取 bin arrays 並立即執行 swap，減少時間差
                bin_arrays = self.dlmm.get_bin_array_for_swap(is_y_to_x)
                if not bin_arrays:
                    logger.error("Failed to get bin arrays")
                    return False
                
                # 增加滑點容忍度到 10%
                slippage = 10000
                swap_quote = self.dlmm.swap_quote(amount, is_y_to_x, slippage, bin_arrays)
                logger.info(f"Raw swap quote: {swap_quote.__dict__}")
                
                if not isinstance(swap_quote, SwapQuote):
                    logger.error("Invalid swap quote")
                    return False
                
                # 立即執行 swap 交易
                swap_tx = self.dlmm.swap(
                    from_token.public_key,
                    to_token.public_key,
                    int(swap_quote.consumed_in_amount),
                    swap_quote.min_out_amount,
                    self.dlmm.pool_address,
                    self.wallet.pubkey(),
                    swap_quote.bin_arrays_pubkey
                )
                
                logger.info("Sending swap transaction...")
                signature = send_transaction_with_priority(self.client, swap_tx, self.wallet, 'high')
                if not signature:
                    logger.error("Failed to send swap transaction")
                    return False
                    
                logger.info(f"Swap transaction confirmed: {signature}")
                return True
                
            except Exception as e:
                logger.error(f"Error during swap: {str(e)}")
                return False
            
        except Exception as e:
            logger.error(f"Swap failed: {str(e)}")
            return False

    def add_liquidity(self, strategy_type: StrategyType = StrategyType.SpotBalanced) -> Optional[Pubkey]:
        """添加流動性"""
        try:
            logger.info("=== Starting Add Liquidity Process ===")
            
            # 計算 ±20% 的價格範圍對應的 bin
            min_bin_id, max_bin_id = self.calculate_bin_range(20.0)
            
            # 檢查 SOL 餘額
            logger.info("Checking SOL balance...")
            balance = self.client.get_balance(self.wallet.pubkey())
            sol_balance = balance.value / 1e9
            logger.info(f"Current SOL balance: {sol_balance} SOL")
            if sol_balance < 0.1:
                logger.error(f"Insufficient SOL balance. Need at least 0.1 SOL, but only have {sol_balance} SOL")
                return None

            # 確定主要代幣
            logger.info("Determining main token...")
            if self.dlmm.token_X.public_key in [self.USDC_PUBKEY, self.SOL_PUBKEY]:
                main_token = self.dlmm.token_Y
                other_token = self.dlmm.token_X
                is_x_main = False
            else:
                main_token = self.dlmm.token_X
                other_token = self.dlmm.token_Y
                is_x_main = True
            
            logger.info(f"Main token (non-USDC/SOL): {main_token.public_key}")
            logger.info(f"Other token: {other_token.public_key}")

            # 獲取代幣餘額
            logger.info("Getting token balances...")
            main_token_ata = get_associated_token_address(self.wallet.pubkey(), main_token.public_key)
            other_token_ata = get_associated_token_address(self.wallet.pubkey(), other_token.public_key)
            
            try:
                # 獲取主要代幣餘額
                main_token_balance = 0
                try:
                    main_balance = self.client.get_token_account_balance(main_token_ata)
                    if hasattr(main_balance, 'value'):
                        main_token_balance = int(main_balance.value.amount)
                    elif isinstance(main_balance, dict) and 'result' in main_balance:
                        main_token_balance = int(main_balance['result']['value']['amount'])
                except Exception as e:
                    if "could not find account" in str(e):
                        logger.error(f"Main token account {main_token_ata} does not exist")
                        return None
                    raise
                logger.info(f"Main token balance: {main_token_balance}")

                # 獲取其他代幣餘額
                other_token_balance = 0
                if other_token.public_key == self.SOL_PUBKEY:
                    other_token_balance = int(sol_balance * 1e9)  # Convert SOL to lamports
                    logger.info(f"Other token (SOL) balance: {sol_balance} SOL ({other_token_balance} lamports)")
                else:
                    try:
                        other_balance = self.client.get_token_account_balance(other_token_ata)
                        if hasattr(other_balance, 'value'):
                            other_token_balance = int(other_balance.value.amount)
                        elif isinstance(other_balance, dict) and 'result' in other_balance:
                            other_token_balance = int(other_balance['result']['value']['amount'])
                    except Exception as e:
                        if "could not find account" in str(e):
                            logger.error(f"Other token account {other_token_ata} does not exist")
                            return None
                        raise
                    logger.info(f"Other token balance: {other_token_balance}")

                # 獲取當前活躍 bin 和價格
                logger.info("Getting active bin and price...")
                active_bin = self.dlmm.get_active_bin()
                logger.info(f"Active bin: {active_bin}")
                current_price = self.dlmm.from_price_per_lamport(active_bin.price)
                logger.info(f"Current price: {current_price}")

                # 計算更寬的 bin 範圍 (±100 bins)
                bin_range = 6#10#24#100  # 使用固定的 bin 範圍
                min_bin_id = active_bin.bin_id - bin_range
                max_bin_id = active_bin.bin_id + bin_range
                
                logger.info("=== Price Range Information ===")
                logger.info(f"Min bin ID: {min_bin_id}")
                logger.info(f"Active bin ID: {active_bin.bin_id}")
                logger.info(f"Max bin ID: {max_bin_id}")

                # 計算添加的數量
                logger.info("Calculating amounts to add...")
                buffer_ratio = 0.99  # 保留 1% 作為 buffer
                main_token_amount = int(main_token_balance * buffer_ratio)
                
                if main_token_amount == 0:
                    logger.error("Insufficient main token balance")
                    return None

                # 根據價格計算另一個代幣所需數量
                if is_x_main:
                    other_token_amount = int(main_token_amount * current_price)
                else:
                    other_token_amount = int(main_token_amount / current_price)
                
                logger.info(f"Initial calculated amounts:")
                logger.info(f"Main token amount: {main_token_amount}")
                logger.info(f"Required other token amount: {other_token_amount}")

                # 檢查另一個代幣是否足夠
                if other_token_amount > other_token_balance:
                    ratio = other_token_balance / other_token_amount
                    other_token_amount = int(other_token_balance * buffer_ratio)
                    main_token_amount = int(main_token_amount * ratio * buffer_ratio)
                    logger.info(f"Adjusted amounts due to other token balance:")
                    logger.info(f"New main token amount: {main_token_amount}")
                    logger.info(f"New other token amount: {other_token_amount}")

                # 生成新的倉位密鑰對
                position_keypair = Keypair()
                logger.info(f"New position address: {position_keypair.pubkey()}")

                # 創建策略參數
                strategy_params = StrategyParameters(
                    max_bin_id=max_bin_id,
                    min_bin_id=min_bin_id,
                    strategy_type=strategy_type,
                    params=None
                )
                
                # 準備添加流動性的參數
                x_amount = main_token_amount if is_x_main else other_token_amount
                y_amount = other_token_amount if is_x_main else main_token_amount
                
                logger.info("=== Adding Liquidity ===")
                logger.info(f"Adding {x_amount} token X and {y_amount} token Y")
                
                # 創建交易
                position_tx = self.dlmm.initialize_position_and_add_liquidity_by_strategy(
                    position_pub_key=position_keypair.pubkey(),
                    user=self.wallet.pubkey(),
                    x_amount=str(x_amount),
                    y_amount=str(y_amount),
                    strategy=strategy_params
                )

                # 使用 send_transaction_with_priority 發送交易
                logger.info("Sending add liquidity transaction...")
                signature = send_transaction_with_priority(
                    self.client,
                    position_tx,
                    self.wallet,
                    'high',  # 使用高優先級
                    [position_keypair]  # 添加 position_keypair 作為額外的簽名者
                )
                
                if not signature:
                    logger.error("Failed to send add liquidity transaction")
                    return None
                    
                logger.info(f"Add liquidity transaction sent: {signature}")
                
                # 檢查交易狀態
                try:
                    status = self.client.get_transaction(signature)
                    logger.info(f"Transaction status: {status}")
                    
                    self.client.confirm_transaction(signature)
                    logger.info("Add liquidity transaction confirmed")
                    time.sleep(2)
                except Exception as e:
                    logger.error(f"Failed to confirm transaction: {str(e)}")
                    return None

                # 驗證位置是否創建成功
                time.sleep(5)  # 等待索引更新
                positions = self.dlmm.get_positions_by_user_and_lb_pair(self.wallet.pubkey())
                position_found = False
                
                for pos in positions.user_positions:
                    if str(pos.public_key) == str(position_keypair.pubkey()):
                        position_found = True
                        logger.info(f"Position verified: {position_keypair.pubkey()}")
                        break
                
                if not position_found:
                    logger.error("Position creation could not be verified")
                    return None
                
                return position_keypair.pubkey()
                
            except Exception as e:
                logger.error(f"Error adding liquidity: {str(e)}")
                logger.error(f"Error type: {type(e)}")
                return None

        except Exception as e:
            logger.error(f"Error in add_liquidity: {str(e)}")
            logger.error(f"Error type: {type(e)}")
            return None

    def remove_liquidity_and_claim_rewards(self, position_pubkey: Pubkey) -> bool:
        """移除流動性並領取獎勵"""
        MAX_RETRIES = 5  # 增加最大重試次數
        RETRY_DELAY = 5  # 每次重試間隔秒數
        
        for attempt in range(MAX_RETRIES):
            try:
                logger.info(f"\n=== Starting Remove Liquidity Process (Attempt {attempt + 1}/{MAX_RETRIES}) ===")
                positions = self.dlmm.get_positions_by_user_and_lb_pair(self.wallet.pubkey())
                position = next((p for p in positions.user_positions if p.public_key == position_pubkey), None)
                
                if not position:
                    logger.error("Position not found")
                    if attempt < MAX_RETRIES - 1:
                        time.sleep(RETRY_DELAY)
                        continue
                    return False
                    
                try:
                    # 先嘗試領取獎勵
                    try:
                        logger.info(f"Position rewards:")
                        reward_one = int(position.position_data.reward_one, 16) if position.position_data.reward_one != '00' else 0
                        reward_two = int(position.position_data.reward_two, 16) if position.position_data.reward_two != '00' else 0
                        logger.info(f"Reward One: {reward_one}")
                        logger.info(f"Reward Two: {reward_two}")
                        
                        # 無論是否有獎勵，都嘗試領取
                        logger.info("Attempting to claim all rewards...")
                        claim_txs = self.dlmm.claim_all_rewards(
                            owner=self.wallet.pubkey(),
                            positions=[position]
                        )
                        
                        # 處理每個領取獎勵的交易
                        for i, tx in enumerate(claim_txs):
                            logger.info(f"Sending claim reward transaction {i+1}/{len(claim_txs)}")
                            signature = send_transaction_with_priority(self.client, tx, self.wallet, 'high')
                            if not signature:
                                logger.error(f"Failed to send claim reward transaction {i+1}")
                                return False
                            logger.info(f"Claim reward transaction {i+1} confirmed: {signature}")
                            time.sleep(2)
                        
                    except Exception as e:
                        logger.error(f"Failed to claim rewards: {str(e)}")
                        # 繼續執行，即使獎勵領取失敗
                    
                    # 獲取所有 bin IDs
                    bin_ids = [bin_data.bin_id for bin_data in position.position_data.position_bin_data]
                    logger.info(f"Removing liquidity from bins: {bin_ids}")
                    
                    # 移除流動性
                    logger.info("Processing remove liquidity transaction")
                    remove_txs = self.dlmm.remove_liqidity(
                        position_pubkey,
                        self.wallet.pubkey(),
                        bin_ids,
                        100*100,  # 100%
                        True # should add this parameter # albert
                    )
                    
                    # 處理每個移除流動性的交易
                    for i, tx in enumerate(remove_txs):
                        logger.info(f"Sending remove liquidity transaction {i+1}/{len(remove_txs)}")
                        signature = send_transaction_with_priority(self.client, tx, self.wallet, 'high')
                        if not signature:
                            logger.error(f"Failed to send remove liquidity transaction {i+1}")
                            return False
                        logger.info(f"Remove liquidity transaction {i+1} confirmed: {signature}")
                        time.sleep(2)
                    
                    # 確認流動性已被移除
                    time.sleep(5)  # 等待狀態更新
                    updated_positions = self.dlmm.get_positions_by_user_and_lb_pair(self.wallet.pubkey())
                    updated_position = next((p for p in updated_positions.user_positions if p.public_key == position_pubkey), None)
                    
                    if updated_position:
                        total_x = float(updated_position.position_data.total_x_amount)
                        total_y = float(updated_position.position_data.total_y_amount)
                        
                        if total_x < 0.001 and total_y < 0.001:
                            logger.info("Successfully removed all liquidity")
                            return True
                        else:
                            logger.warning(f"Position still has liquidity: X={total_x}, Y={total_y}")
                            if attempt < MAX_RETRIES - 1:
                                time.sleep(RETRY_DELAY)
                                continue
                            return False
                    else:
                        logger.warning("Could not find position after removing liquidity")
                        return True  # 可能是因為倉位已經完全關閉
                    
                except Exception as e:
                    logger.error(f"Failed to send remove liquidity transaction: {str(e)}")
                    if attempt < MAX_RETRIES - 1:
                        logger.info(f"Retrying in {RETRY_DELAY} seconds...")
                        time.sleep(RETRY_DELAY)
                        continue
                    return False
                
            except Exception as e:
                logger.error(f"Error in remove_liquidity_and_claim_rewards: {str(e)}")
                if attempt < MAX_RETRIES - 1:
                    logger.info(f"Retrying in {RETRY_DELAY} seconds...")
                    time.sleep(RETRY_DELAY)
                    continue
                return False
        
        return False

    def get_active_bin_info(self) -> Tuple[int, float]:
        """獲取當前活躍 bin 信息"""
        active_bin = self.dlmm.get_active_bin()
        price = self.dlmm.from_price_per_lamport(active_bin.price)
        return active_bin.bin_id, price

    def calculate_optimal_bin_range(self) -> Tuple[int, int]:
        """計算最佳 bin 範圍"""
        try:
            active_bin = self.dlmm.get_active_bin()
            if not active_bin:
                raise ValueError("Could not get active bin")
            
            # 使用較小的範圍以確保流動性集中
            return active_bin.bin_id - 1, active_bin.bin_id + 1
        except Exception as e:
            logger.error(f"Error getting active bin: {e}")
            raise

    def calculate_optimal_liquidity_distribution(self, 
                                              total_value_usdc: float,
                                              min_bin: int,
                                              max_bin: int) -> Tuple[int, int]:
        """
        計算最佳的流動性分配
        """
        try:
            # 先獲取當前價格，以便在錯誤處理時使用
            active_bin = self.dlmm.get_active_bin()
            current_price = float(active_bin.price_per_token)
            logger.info(f"Active bin price: {current_price}")
            
            # 獲取 bin 分佈信息
            try:
                bins = self.dlmm.get_bins_between_lower_and_upper_bound(min_bin, max_bin)
                logger.info(f"Got bins data: {bins.__dict__ if hasattr(bins, '__dict__') else 'No bins data'}")
                
                if not bins or not hasattr(bins, 'bin_liquidty') or not bins.bin_liquidty:
                    logger.warning("No valid bins data available, using default distribution")
                    raise ValueError("No valid bins data")
                    
                # 計算加權價格
                total_liquidity = 0
                weighted_price = 0
                for bin_data in bins.bin_liquidty:
                    try:
                        # 直接使用 bin_data 的屬性，不檢查 binId
                        bin_price = float(bin_data.price_per_token)
                        bin_liquidity = float(bin_data.supply) if hasattr(bin_data, 'supply') else 1
                        total_liquidity += bin_liquidity
                        weighted_price += bin_liquidity * bin_price
                        logger.debug(f"Processing bin: price={bin_price}, liquidity={bin_liquidity}")
                    except Exception as e:
                        logger.warning(f"Error processing bin data: {e}")
                        continue
                
                if total_liquidity > 0:
                    weighted_price /= total_liquidity
                else:
                    weighted_price = current_price
                    
                logger.info(f"Weighted price: {weighted_price}")
                
                # 根據加權價格計算分配比例
                ratio = current_price / weighted_price
                x_ratio = ratio / (1 + ratio)
                y_ratio = 1 / (1 + ratio)
                
            except Exception as e:
                logger.warning(f"Error processing bins data: {str(e)}, using default distribution")
                # 使用默認的 50/50 分配
                x_ratio = 0.5
                y_ratio = 0.5
            
            # 計算具體金額
            x_amount = int(total_value_usdc * x_ratio * (10 ** self.dlmm.token_X.decimal) / current_price)
            y_amount = int(total_value_usdc * y_ratio * (10 ** self.dlmm.token_Y.decimal))
            
            logger.info(f"Optimal liquidity distribution:")
            logger.info(f"X amount: {x_amount} ({x_ratio*100:.2f}%)")
            logger.info(f"Y amount: {y_amount} ({y_ratio*100:.2f}%)")
            
            return x_amount, y_amount
            
        except Exception as e:
            logger.error(f"Error in calculate_optimal_liquidity_distribution: {str(e)}")
            # 使用一個安全的默認價格
            safe_price = current_price if 'current_price' in locals() else 1.0
            
            # 返回默認的 50/50 分配
            x_amount = int(total_value_usdc * 0.5 * (10 ** self.dlmm.token_X.decimal) / safe_price)
            y_amount = int(total_value_usdc * 0.5 * (10 ** self.dlmm.token_Y.decimal))
            return x_amount, y_amount

    def monitor_position(self, position_pubkey: Pubkey) -> Dict:
        """
        監控倉位狀態和收益
        """
        try:
            logger.info("\n=== Checking Position Status ===")
            positions = self.dlmm.get_positions_by_user_and_lb_pair(self.wallet.pubkey())
            
            # 打印完整的倉位信息
            logger.info("\n=== All User Positions ===")
            for pos in positions.user_positions:
                logger.info(f"\nPosition Details:")
                logger.info(f"Public Key: {pos.public_key}")
                logger.info(f"Version: {pos.version}")
                
                # 打印倉位數據
                if hasattr(pos, 'position_data'):
                    logger.info("\nPosition Data:")
                    logger.info(f"Total X Amount: {pos.position_data.total_x_amount}")
                    logger.info(f"Total Y Amount: {pos.position_data.total_y_amount}")
                    logger.info(f"Reward One (raw): {pos.position_data.reward_one}")
                    logger.info(f"Reward Two (raw): {pos.position_data.reward_two}")
                    
                    # 打印 bin 數據
                    logger.info("\nBin Data:")
                    for bin_data in pos.position_data.position_bin_data:
                        logger.info(f"  Bin ID: {bin_data.bin_id}")
                        logger.info(f"  X Amount: {bin_data.x_amount if hasattr(bin_data, 'x_amount') else 'N/A'}")
                        logger.info(f"  Y Amount: {bin_data.y_amount if hasattr(bin_data, 'y_amount') else 'N/A'}")
                        
                    # 嘗試打印其他可能的屬性
                    logger.info("\nAdditional Data:")
                    for attr_name in dir(pos.position_data):
                        if not attr_name.startswith('_'):  # 跳過私有屬性
                            try:
                                value = getattr(pos.position_data, attr_name)
                                logger.info(f"{attr_name}: {value}")
                            except Exception as e:
                                logger.debug(f"Could not get value for {attr_name}: {e}")

            # 找到特定的倉位
            position = next((p for p in positions.user_positions if p.public_key == position_pubkey), None)
            
            if not position:
                logger.error("Position not found")
                return {}
            
            logger.info("\n=== Raw Position Data ===")
            logger.info(f"Position public key: {position.public_key}")
            logger.info(f"Position version: {position.version}")
            logger.info(f"Raw position data: {position.position_data.to_json() if hasattr(position.position_data, 'to_json') else position.position_data}")
            
            # 正確解析獎勵數據
            try:
                logger.info("\n=== Checking Rewards ===")
                
                # 檢查原始獎勵數據
                logger.info("Raw reward data:")
                logger.info(f"Reward one (raw): {position.position_data.reward_one}")
                logger.info(f"Reward two (raw): {position.position_data.reward_two}")
                
                # 嘗試不同的解析方式
                try:
                    # 方法1: 直接十六進制轉換
                    reward_one = int(position.position_data.reward_one, 16) if position.position_data.reward_one and position.position_data.reward_one != '00' else 0
                    reward_two = int(position.position_data.reward_two, 16) if position.position_data.reward_two and position.position_data.reward_two != '00' else 0
                    logger.info(f"Method 1 - Hex conversion:")
                    logger.info(f"Reward one: {reward_one}")
                    logger.info(f"Reward two: {reward_two}")
                except ValueError as e:
                    logger.warning(f"Method 1 failed: {e}")
                    reward_one = 0
                    reward_two = 0

                # 方法2: 檢查是否可以領取獎勵
                logger.info("\nChecking claimable rewards:")
                try:
                    claim_lm = self.dlmm.claim_LM_reward(position_pubkey, position)
                    has_lm_reward = isinstance(claim_lm, Transaction)
                    logger.info(f"Has LM reward transaction: {has_lm_reward}")
                    if has_lm_reward:
                        logger.info(f"LM reward transaction: {claim_lm}")
                except Exception as e:
                    logger.warning(f"Error checking LM reward: {e}")
                    has_lm_reward = False

                try:
                    claim_swap_fee = self.dlmm.claim_swap_fee(position_pubkey, position)
                    has_swap_fee = isinstance(claim_swap_fee, Transaction)
                    logger.info(f"Has swap fee transaction: {has_swap_fee}")
                    if has_swap_fee:
                        logger.info(f"Swap fee transaction: {claim_swap_fee}")
                except Exception as e:
                    logger.warning(f"Error checking swap fee: {e}")
                    has_swap_fee = False

                # 檢查倉位詳細信息
                logger.info("\n=== Position Details ===")
                logger.info(f"Total X amount: {position.position_data.total_x_amount}")
                logger.info(f"Total Y amount: {position.position_data.total_y_amount}")
                
                # 獲取 bin 信息
                bin_data = position.position_data.position_bin_data
                logger.info("\n=== Bin Information ===")
                logger.info(f"Number of bins: {len(bin_data)}")
                for i, bin_info in enumerate(bin_data):
                    logger.info(f"Bin {i+1}:")
                    logger.info(f"  Bin ID: {bin_info.bin_id}")
                    logger.info(f"  X amount: {bin_info.x_amount if hasattr(bin_info, 'x_amount') else 'N/A'}")
                    logger.info(f"  Y amount: {bin_info.y_amount if hasattr(bin_info, 'y_amount') else 'N/A'}")
                
                # 檢查代幣信息
                logger.info("\n=== Token Information ===")
                logger.info(f"Token X: {self.dlmm.token_X.public_key}")
                logger.info(f"Token Y: {self.dlmm.token_Y.public_key}")
                
            except Exception as e:
                logger.error(f"Error checking rewards: {str(e)}")
                logger.error(f"Error type: {type(e)}")
                logger.error(f"Stack trace: {traceback.format_exc()}")
                return {}
            
            stats = {
                'position_id': str(position_pubkey),
                'current_time': datetime.now().isoformat(),
                'total_x': float(position.position_data.total_x_amount),
                'total_y': float(position.position_data.total_y_amount),
                'reward_one': reward_one,
                'reward_two': reward_two,
                'has_lm_reward': has_lm_reward,
                'has_swap_fee': has_swap_fee,
                'bin_ids': [bin_info.bin_id for bin_info in bin_data],
                'raw_reward_one': position.position_data.reward_one,
                'raw_reward_two': position.position_data.reward_two
            }
            
            logger.info("\n=== Final Stats ===")
            logger.info(json.dumps(stats, indent=2))
            return stats

        except Exception as e:
            logger.error(f"Error in monitor_position: {str(e)}")
            logger.error(f"Error type: {type(e)}")
            logger.error(f"Stack trace: {traceback.format_exc()}")
            return {}

    def calculate_position_apy(self, position: Position) -> float:
        """計算倉位的年化收益率"""
        initial_data = self.position_history.get(str(position.public_key), {})
        if not initial_data:
            return 0
            
        current_time = datetime.now()
        time_diff = (current_time - initial_data['start_time']).total_seconds() / (365 * 24 * 3600)  # 轉換為年
        
        # 計算收益
        initial_value = initial_data['initial_x_value'] + initial_data['initial_y_value']
        current_value = (float(position.position_data.total_x_amount) * initial_data['initial_x_price'] +
                        float(position.position_data.total_y_amount) * initial_data['initial_y_price'])
        
        # 添加獎勵收益
        reward_one = int(position.position_data.reward_one, 16) if position.position_data.reward_one != '00' else 0
        reward_two = int(position.position_data.reward_two, 16) if position.position_data.reward_two != '00' else 0
        total_rewards = reward_one + reward_two  # 需要轉換為實際價值
        
        total_return = (current_value + total_rewards - initial_value) / initial_value
        apy = (total_return / time_diff) if time_diff > 0 else 0
        
        return apy * 100  # 轉換為百分比

    def execute_trading_strategy(self) -> bool:
        """執行交易策略"""
        try:
            if self.pool_type not in ['USDC', 'SOL']:
                logger.info(f"Unsupported pool type: {self.pool_type}")
                return False

            # 檢查 SOL 餘額
            if not self.check_sol_balance():
                logger.error("Insufficient SOL balance for transaction fees")
                return False

            investment_amount = self.get_investment_amount()
            if not investment_amount:
                logger.error("Could not determine investment amount")
                return False
            
            logger.info(f"Using {self.pool_type} pool with investment amount: {investment_amount}")
            
            # 確定代幣和金額
            base_token = self.USDC_PUBKEY if self.pool_type == 'USDC' else self.SOL_PUBKEY
            decimals = 6 if self.pool_type == 'USDC' else 9
            base_amount = int(investment_amount * 0.5 * (10 ** decimals))
            
            # 檢查代幣餘額
            token_balance = self.get_token_balance(base_token)
            logger.info(f"Current {self.pool_type} balance: {token_balance/(10**decimals)}")
            if token_balance < base_amount:
                logger.error(f"Insufficient {self.pool_type} balance")
                return False
            
            # 確定 swap 方向
            is_y_to_x = base_token == self.dlmm.token_Y.public_key
            swap_amount = base_amount
            
            # 在每次操作之間添加足夠的延遲
            time.sleep(10)
            
            logger.info(f"Preparing to swap {swap_amount/(10**decimals)} {self.pool_type}")
            if not self.swap_tokens(swap_amount, is_y_to_x):
                logger.error("Trading strategy execution failed")
                return False
            
            # 等待 swap 確認
            time.sleep(5)
            
            # 添加流動性
            position_pubkey = self.add_liquidity(strategy_type=StrategyType.SpotBalanced)
            
            if not position_pubkey:
                logger.error("Failed to add liquidity")
                return False
            
            logger.info(f"Successfully added liquidity, position: {position_pubkey}")
            
            # 儲存上一次的 bin 數據用於比較
            previous_bin_data = {}
            inactive_periods = 0  # 追蹤無活動的週期數
            MAX_INACTIVE_PERIODS = 10  # 最大允許的無活動週期數
            
            while True:
                try:
                    positions = self.dlmm.get_positions_by_user_and_lb_pair(self.wallet.pubkey())
                    logger.info(f"Positions: {positions}")
                    
                    # 打印 positions 的詳細信息
                    logger.info("\n=== Detailed Positions Information ===")
                    total_rewards_fees = 0
                    current_bin_data = {}
                    trading_activity = False
                    
                    for i, pos in enumerate(positions.user_positions):
                        if hasattr(pos, 'position_data'):
                            logger.info("\nPosition Data:")
                            logger.info(f"Raw position data (to_json): {pos.position_data.to_json()}")
                            
                            # 收集當前 bin 數據
                            for bin_info in pos.position_data.position_bin_data:
                                bin_id = bin_info.bin_id
                                current_bin_data[bin_id] = {
                                    'x_amount': float(bin_info.x_amount if hasattr(bin_info, 'x_amount') else 0),
                                    'y_amount': float(bin_info.y_amount if hasattr(bin_info, 'y_amount') else 0),
                                    'liquidity': float(bin_info.bin_liquidity if hasattr(bin_info, 'bin_liquidity') else 0)
                                }
                            
                            # 比較與上一次的數據
                            if previous_bin_data:
                                logger.info("\n=== Trading Activity Analysis ===")
                                for bin_id, current_data in current_bin_data.items():
                                    if bin_id in previous_bin_data:
                                        prev_data = previous_bin_data[bin_id]
                                        x_change = abs(current_data['x_amount'] - prev_data['x_amount'])
                                        y_change = abs(current_data['y_amount'] - prev_data['y_amount'])
                                        liquidity_change = abs(current_data['liquidity'] - prev_data['liquidity'])
                                        
                                        logger.info(f"\nBin {bin_id} changes:")
                                        logger.info(f"X amount change: {x_change}")
                                        logger.info(f"Y amount change: {y_change}")
                                        logger.info(f"Liquidity change: {liquidity_change}")
                                        
                                        # 檢查是否有顯著變化
                                        if x_change > 0.001 or y_change > 0.001 or liquidity_change > 0.001:
                                            trading_activity = True
                        
                            # 處理 fees 和 rewards
                            fee_x = int(pos.position_data.fee_X, 16) if pos.position_data.fee_X != '00' else 0
                            fee_y = int(pos.position_data.fee_Y, 16) if pos.position_data.fee_Y != '00' else 0
                            reward_one = int(pos.position_data.reward_one, 16) if pos.position_data.reward_one != '00' else 0
                            reward_two = int(pos.position_data.reward_two, 16) if pos.position_data.reward_two != '00' else 0
                            
                            total_rewards_fees = fee_x + fee_y + reward_one + reward_two
                            logger.info(f"\nTotal rewards and fees: {total_rewards_fees}")
                    
                    # 更新無活動週期計數
                    if not trading_activity:
                        inactive_periods += 1
                        logger.info(f"No trading activity detected. Inactive periods: {inactive_periods}/{MAX_INACTIVE_PERIODS}")
                    else:
                        inactive_periods = 0
                        logger.info("Trading activity detected, resetting inactive period counter")
                    
                    # 儲存當前數據用於下次比較
                    previous_bin_data = current_bin_data
                    
                    position = next((p for p in positions.user_positions if p.public_key == position_pubkey), None)
                    if not position:
                        logger.error("Position not found")
                        break
                    
                    # 檢查是否應該退出
                    if total_rewards_fees > 20000:
                        logger.info("Reached reward/fee threshold, proceeding to remove liquidity")
                        break
                    elif inactive_periods >= MAX_INACTIVE_PERIODS:
                        logger.info(f"No trading activity for {MAX_INACTIVE_PERIODS} periods, proceeding to remove liquidity")
                        break
                    
                    try:
                        active_bin = self.dlmm.get_active_bin()
                        logger.info(f"Active bin: {active_bin}")
                    except Exception as e:
                        logger.warning(f"Could not get active bin: {e}")
                    
                    time.sleep(60)  # 每分鐘檢查一次
                    
                except Exception as e:
                    logger.error(f"Error in monitoring loop: {str(e)}")
                    time.sleep(60)
                    continue
            
            # 移除流動性並領取獎勵
            if not self.remove_liquidity_and_claim_rewards(position_pubkey):
                logger.error("Failed to remove liquidity and claim rewards")
                return False
            
            # Swap 所有代幣回基礎代幣（USDC 或 SOL）
            final_balance = self.get_token_balance(
                self.dlmm.token_X.public_key if is_y_to_x else self.dlmm.token_Y.public_key
            )
            
            if final_balance > 0:
                if not self.swap_tokens(final_balance, not is_y_to_x):
                    logger.error("Failed to swap back to base token")
                    return False
            
            return True
            
        except Exception as e:
            logger.error(f"Error in trading strategy: {e}")
            return False

    def calculate_bin_range(self, percentage: float = 20.0) -> Tuple[int, int]:
        """
        計算當前價格上下指定百分比對應的 bin 範圍
        
        Args:
            percentage: 價格範圍百分比 (例如: 20.0 表示 ±20%)
            
        Returns:
            Tuple[int, int]: (lower_bin_id, upper_bin_id)
        """
        try:
            # 獲取當前 active bin
            active_bin = self.dlmm.get_active_bin()
            current_price = float(active_bin.price)
            current_bin_id = active_bin.bin_id
            
            logger.info(f"Active bin ID: {current_bin_id}")
            logger.info(f"Current price: {current_price}")
            
            # 計算目標價格範圍
            lower_price = current_price * (1 - percentage/100)
            upper_price = current_price * (1 + percentage/100)
            
            logger.info(f"Target price range: {lower_price} to {upper_price}")
            
            # Meteora 的 bin 大小是 1.0001
            bin_step = 1.0001
            
            # 計算需要移動的 bin 數量
            lower_bin_diff = int(math.log(lower_price/current_price) / math.log(bin_step))
            upper_bin_diff = int(math.log(upper_price/current_price) / math.log(bin_step))
            
            lower_bin_id = current_bin_id + lower_bin_diff
            upper_bin_id = current_bin_id + upper_bin_diff
            
            logger.info(f"Calculated bin range:")
            logger.info(f"Lower bin: {lower_bin_id} ({lower_bin_diff} bins from active)")
            logger.info(f"Upper bin: {upper_bin_id} ({upper_bin_diff} bins from active)")
            
            return lower_bin_id, upper_bin_id
            
        except Exception as e:
            logger.error(f"Error calculating bin range: {str(e)}")
            # 如果計算失敗，返回一個預設的範圍
            return current_bin_id - 100, current_bin_id + 100

def load_wallet_from_env() -> Keypair:
    """
    從 .env 文件加載私鑰並轉換為 Keypair
    
    .env 文件格式:
    PRIVATE_KEY=your_base58_private_key
    """
    load_dotenv()
    private_key_base58 = os.getenv('PRIVATE_KEY')
    if not private_key_base58:
        raise ValueError("No PRIVATE_KEY found in .env file")
        
    try:
        # 將 base58 格式的私鑰轉換為字節數組
        private_key_bytes = base58.b58decode(private_key_base58)
        return Keypair.from_bytes(private_key_bytes)
    except Exception as e:
        raise ValueError(f"Invalid private key format: {e}")

def wait_for_confirmation(client: Client, signature: str, max_retries: int = 3, delay: int = 5) -> bool:
    """等待交易確認，帶重試機制"""
    for i in range(max_retries):
        try:
            client.confirm_transaction(signature)
            logger.info(f"Transaction confirmed: {signature}")
            return True
        except Exception as e:
            if i == max_retries - 1:
                logger.error(f"Failed to confirm transaction after {max_retries} attempts: {e}")
                return False
            logger.warning(f"Retry {i + 1}/{max_retries}: {e}")
            time.sleep(delay)
    return False

def send_transaction_with_priority(
    client: Client, 
    tx: Transaction, 
    wallet: Keypair, 
    priority_level: str = 'medium',
    additional_signers: List[Keypair] = None
) -> Optional[str]:
    """
    發送交易並設置優先級費用
    
    Args:
        client: Solana client
        tx: 要發送的交易
        wallet: 錢包
        priority_level: 'low', 'medium', 或 'high'
        additional_signers: 額外的簽名者列表（可選）
    """
    try:
        priority_fees = {
            'low': 1000,      # 0.000001 SOL
            'medium': 10000,  # 0.00001 SOL
            'high': 100000    # 0.0001 SOL
        }
        
        priority_fee = priority_fees.get(priority_level, priority_fees['medium'])
        
        # 檢查交易是否已經包含計算預算指令
        has_compute_budget = any(ix.program_id == COMPUTE_BUDGET_ID for ix in tx.instructions)
        
        if not has_compute_budget:
            # 創建計算預算指令
            compute_unit_limit = 200_000
            compute_budget_ix = set_compute_unit_limit(compute_unit_limit)
            priority_fee_ix = set_compute_unit_price(priority_fee)
            
            # 在交易開始處添加計算預算指令
            tx.instructions.insert(0, compute_budget_ix)
            tx.instructions.insert(1, priority_fee_ix)
        
        # 獲取最新的 blockhash
        recent_blockhash = client.get_latest_blockhash()
        tx.recent_blockhash = recent_blockhash.value.blockhash
        tx.fee_payer = wallet.pubkey()
        
        logger.info(f"Sending transaction with {priority_level} priority (fee: {priority_fee/1e9} SOL)")
        
        # 發送交易，處理額外的簽名者
        if additional_signers:
            result = client.send_transaction(tx, wallet, *additional_signers)
        else:
            result = client.send_transaction(tx, wallet)
            
        signature = result.value
        logger.info(f"Transaction sent: {signature}")
        
        return signature
        
    except Exception as e:
        logger.error(f"Failed to send transaction: {str(e)}")
        return None

def create_ata_if_not_exists(client: Client, user: Keypair, mint: Pubkey) -> Optional[Pubkey]:
    """創建 ATA 如果不存在"""
    try:
        ata = get_associated_token_address(user.pubkey(), mint)
        account_info = client.get_account_info(ata)
        
        if account_info.value is not None:
            logger.info(f"ATA exists for mint {mint}")
            return ata

        logger.info(f"Creating ATA for mint {mint}")
        tx = Transaction()
        create_ata_ix = create_associated_token_account(
            payer=user.pubkey(),
            owner=user.pubkey(),
            mint=mint
        )
        tx.add(create_ata_ix)
        
        signature = send_transaction_with_priority(client, tx, user, 'high')
        if signature:
            logger.info(f"Created ATA: {ata}")
            time.sleep(2)
            return ata
        return None
        
    except Exception as e:
        logger.error(f"Failed to create ATA: {str(e)}")
        return None

def wrap_sol(client: Client, user: Keypair, amount: int) -> bool:
    """包裝 SOL 為 wSOL"""
    try:
        wsol_mint = Pubkey.from_string("So11111111111111111111111111111111111111112")
        wsol_ata = create_ata_if_not_exists(client, user, wsol_mint)
        if not wsol_ata:
            logger.error("Failed to create or get wSOL ATA")
            return False
            
        logger.info(f"Using wSOL ATA: {wsol_ata}")
        
        balance = client.get_balance(user.pubkey())
        if balance.value < amount + 5000:
            logger.error(f"Insufficient SOL balance for wrapping")
            return False
        
        tx = Transaction()
        tx.add(transfer(TransferParams(
            from_pubkey=user.pubkey(),
            to_pubkey=wsol_ata,
            lamports=amount
        )))
        tx.add(create_sync_native_instruction(wsol_ata))
        
        signature = send_transaction_with_priority(client, tx, user, 'high')
        if signature:
            logger.info(f"Wrapped {amount/1e9} SOL to wSOL")
            time.sleep(2)
            return True
        return False
        
    except Exception as e:
        logger.error(f"Failed to wrap SOL: {str(e)}")
        return False

def main():
    
    helius_api_key = 'helius_api_key'

    RPC_URL = f"https://mainnet.helius-rpc.com/?api-key={helius_api_key}"

    #POOL_ADDRESS = "5ghuEGEejeB6aQ6CHu58Ks9dN4jPNHWaGxSVC1YGamTL" #SOL
    POOL_ADDRESS = "9d9mb8kooFfaD3SctgZtkxQypkshx6ezhbKio89ixyy2" #USDC
    TOTAL_INVESTMENT_USDC = 10#50  # 1000 USDC
    TOTAL_INVESTMENT_SOL = 0.001#0.01  # 1 SOL
    
    try:
        # 從 .env 加載錢包
        wallet = load_wallet_from_env()
        logger.info(f"Wallet loaded successfully: {wallet.pubkey()}")
        
        # 添加 RPC 連接測試
        client = Client(RPC_URL)
        try:
            # 測試 RPC 連接
            client.get_version()
            logger.info("RPC connection successful")
        except Exception as e:
            logger.error(f"Failed to connect to RPC: {e}")
            return
            
        trader = DLMMTrader(
            POOL_ADDRESS, 
            RPC_URL, 
            wallet,
            TOTAL_INVESTMENT_USDC,
            TOTAL_INVESTMENT_SOL
        )
        
        # 檢查池子類型
        if trader.pool_type == 'UNSUPPORTED':
            logger.error("Unsupported pool type - neither USDC nor SOL pair")
            return
        
        # 檢查 SOL 餘額（用於交易費）
        if not trader.check_sol_balance():
            logger.error("Insufficient SOL balance for transaction fees")
            return
        
        # 執行交易策略
        if trader.execute_trading_strategy():
            logger.info("Trading strategy executed successfully")
        else:
            logger.error("Trading strategy execution failed")

    except Exception as e:
        logger.error(f"Failed to initialize: {e}")
        return

if __name__ == "__main__":
    main()
