from dataclasses import dataclass
from enum import Enum, IntEnum
from solders.pubkey import Pubkey
from typing import Any, List, TypedDict, Optional, Dict
import logging

logger = logging.getLogger(__name__)

class DlmmHttpError(Exception):
    def __init__(self, message):
        super().__init__(message)

class StrategyType(IntEnum):
    SpotBalanced = 0
    CurveBalanced = 1
    BidAsk = 2

class ActivationType(Enum):  
    Slot=0,
    Timestamp=1,

    def __str__(self) -> str:
        return f"{self.value[1]}"
    
    def __repr__(self) -> str:
        return self.name


class PositionVersion(Enum):
    V1="V1",
    V2="V2"

    def __str__(self) -> str:
        return self.name
    
    def __repr__(self) -> str:
        return self.name

@dataclass
class StrategyParameters:
    max_bin_id: int
    min_bin_id: int
    strategy_type: StrategyType
    params: Optional[dict] = None

    def to_json(self) -> dict:
        strategy_json = {
            "maxBinId": self.max_bin_id,
            "minBinId": self.min_bin_id,
            "strategyType": int(self.strategy_type),
            "params": self.params
        }
        logger.info(f"Serialized strategy parameters: {strategy_json}")
        return strategy_json

    def __str__(self):
        return f"StrategyParameters(max_bin_id={self.max_bin_id}, min_bin_id={self.min_bin_id}, strategy_type={self.strategy_type.name}({int(self.strategy_type)}), params={self.params})"

@dataclass
class ActiveBin():
    bin_id: int
    x_amount: str
    y_amount: str
    supply: str
    price: float
    version: int
    price_per_token: str

    def __init__(self, data: dict):
        self.bin_id = data["binId"]
        self.x_amount = data["xAmount"]
        self.y_amount = data["yAmount"]
        self.supply = data["supply"]
        self.price = float(data["price"])
        self.version = data["version"]
        self.price_per_token = data["pricePerToken"]

@dataclass
class PositionBinData():
    bin_id: int
    price: str
    price_per_token: str
    bin_x_Amount: str
    bin_y_Amount: str
    bin_liquidity: str
    position_liquidity: str
    position_x_amount: str
    position_y_amount: str

    def __init__(self, data: dict):
        if data.get("binId") is None:
            raise AttributeError("binId is required")
        if data.get("price") is None:
            raise AttributeError("price is required")
        if data.get("pricePerToken") is None:
            raise AttributeError("pricePerToken is required")
        if data.get("binXAmount") is None:
            raise AttributeError("binXAmount is required")
        if data.get("binYAmount") is None:
            raise AttributeError("binYAmount is required")
        if data.get("binLiquidity") is None:
            raise AttributeError("binLiquidity is required")
        if data.get("positionLiquidity") is None:
            raise AttributeError("positionLiquidity is required")
        if data.get("positionXAmount") is None:
            raise AttributeError("positionXAmount is required")
        if data.get("positionYAmount") is None:
            raise AttributeError("positionYAmount is required")

        self.bin_id = data["binId"]
        self.price = data["price"]
        self.price_per_token = data["pricePerToken"]
        self.bin_x_Amount = data["binXAmount"]
        self.bin_y_Amount = data["binYAmount"]
        self.bin_liquidity = data["binLiquidity"]
        self.position_liquidity = data["positionLiquidity"]
        self.position_x_amount = data["positionXAmount"]
        self.position_y_amount = data["positionYAmount"]

    def to_json(self) -> dict:
        return {
            "binId": self.bin_id,
            "price": self.price,
            "pricePerToken": self.price_per_token,
            "binXAmount": self.bin_x_Amount,
            "binYAmount": self.bin_y_Amount,
            "binLiquidity": self.bin_liquidity,
            "positionLiquidity": self.position_liquidity,
            "positionXAmount": self.position_x_amount,
            "positionYAmount": self.position_y_amount
        }

@dataclass
class PositionData():
    total_x_amount: str
    total_y_amount: str
    position_bin_data: List[PositionBinData]
    last_updated_at: int
    upper_bin_id: int
    lower_bin_id: int
    fee_X: int
    fee_Y: int
    reward_one: int
    reward_two: int
    fee_owner: str
    total_claimed_fee_X_amount: int
    total_claimed_fee_Y_amount: int

    def __init__(self, data: dict):
        if data.get("totalXAmount") is None:
            raise AttributeError("totalXAmount is required")
        if data.get("totalYAmount") is None:
            raise AttributeError("totalYAmount is required")
        if data.get("positionBinData") is None:
            raise AttributeError("positionBinData is required")
        if data.get("lastUpdatedAt") is None:
            raise AttributeError("lastUpdatedAt is required")
        if data.get("upperBinId") is None:
            raise AttributeError("upperBinId is required")
        if data.get("lowerBinId") is None:
            raise AttributeError("lowerBinId is required")
        if data.get("feeX") is None:
            raise AttributeError("feeX is required")
        if data.get("feeY") is None:
            raise AttributeError("feeY is required")
        if data.get("rewardOne") is None:
            raise AttributeError("rewardOne is required")
        if data.get("rewardTwo") is None:
            raise AttributeError("rewardTwo is required")
        #if data.get("feeOwner") is None:
        #    raise AttributeError("feeOwner is required")
        if data.get("totalClaimedFeeXAmount") is None:
            raise AttributeError("totalClaimedFeeXAmount is required")
        if data.get("totalClaimedFeeYAmount") is None:
            raise AttributeError("totalClaimedFeeYAmount is required")

        self.total_x_amount = data["totalXAmount"]
        self.total_y_amount = data["totalYAmount"]
        self.position_bin_data = [PositionBinData(bin_data) for bin_data in data["positionBinData"]]
        self.last_updated_at = data["lastUpdatedAt"]
        self.upper_bin_id = data["upperBinId"]
        self.lower_bin_id = data["lowerBinId"]
        self.fee_X = data["feeX"]
        self.fee_Y = data["feeY"]
        self.reward_one = data["rewardOne"]
        self.reward_two = data["rewardTwo"]
        self.fee_owner = data["feeOwner"]
        self.total_claimed_fee_X_amount = data["totalClaimedFeeXAmount"]
        self.total_claimed_fee_Y_amount = data["totalClaimedFeeYAmount"]
    
    def to_json(self) -> dict:
        return {
            "totalXAmount": self.total_x_amount,
            "totalYAmount": self.total_y_amount,
            "positionBinData": [bin_data.to_json() for bin_data in self.position_bin_data],
            "lastUpdatedAt": self.last_updated_at,
            "upperBinId": self.upper_bin_id,
            "lowerBinId": self.lower_bin_id,
            "feeX": self.fee_X,
            "feeY": self.fee_Y,
            "rewardOne": self.reward_one,
            "rewardTwo": self.reward_two,
            "feeOwner": self.fee_owner,
            "totalClaimedFeeXAmount": self.total_claimed_fee_X_amount,
            "totalClaimedFeeYAmount": self.total_claimed_fee_Y_amount
        }

class Position:
    def __init__(self, public_key: Pubkey, position_data: PositionData, version: str = "1"):
        self.public_key = public_key
        self.position_data = position_data
        self.version = version

    @classmethod
    def from_json(cls, data: Dict[str, Any]) -> 'Position':
        return cls(
            public_key=Pubkey.from_string(data['publicKey']),
            position_data=PositionData.from_json(data['positionData']),
            version=data.get('version', "1")  # 默認版本為 "1"
        )

    def to_json(self) -> Dict[str, Any]:
        return {
            'publicKey': str(self.public_key),
            'positionData': self.position_data.to_json(),
            'version': self.version
        }

    def __str__(self):
        return f"Position(public_key={self.public_key}, version={self.version})"

@dataclass
class GetPositionByUser():
    active_bin: ActiveBin
    user_positions: List[Position]

    def __init__(self, data: dict):
        self.active_bin = ActiveBin(data["activeBin"])
        self.user_positions = []
        if "userPositions" in data:
            for position_data in data["userPositions"]:
                try:
                    if "publicKey" in position_data and "positionData" in position_data:
                        position = Position(
                            public_key=Pubkey.from_string(position_data["publicKey"]),
                            position_data=PositionData(position_data["positionData"]),
                            version=position_data.get("version", "1")
                        )
                        self.user_positions.append(position)
                    else:
                        logger.warning(f"Skipping invalid position data: {position_data}")
                except Exception as e:
                    logger.error(f"Error creating position: {str(e)}")
                    logger.error(f"Position data: {position_data}")

@dataclass
class SwapQuote:
    consumed_in_amount: int
    out_amount: int
    fee: int
    protocol_fee: int
    min_out_amount: int
    price_impact: float
    bin_arrays_pubkey: List[str]
    end_price: float

    def __init__(self, data: dict) -> None:
        # 將十六進制字符串轉換為十進制整數
        self.consumed_in_amount = int(data["consumedInAmount"], 16)
        self.out_amount = int(data["outAmount"], 16)
        self.fee = int(data["fee"], 16)
        self.protocol_fee = int(data["protocolFee"], 16)
        self.min_out_amount = int(data["minOutAmount"], 16)
        
        # price_impact 可能是字符串或數字
        self.price_impact = float(data["priceImpact"])
        
        # bin_arrays_pubkey 是字符串列表
        self.bin_arrays_pubkey = data["binArraysPubkey"]
        
        # end_price 是浮點數字符串
        self.end_price = float(data["endPrice"])

    def __str__(self) -> str:
        return (
            f"SwapQuote(consumed_in_amount={self.consumed_in_amount}, "
            f"out_amount={self.out_amount}, "
            f"fee={self.fee}, "
            f"protocol_fee={self.protocol_fee}, "
            f"min_out_amount={self.min_out_amount}, "
            f"price_impact={self.price_impact}, "
            f"bin_arrays_pubkey={self.bin_arrays_pubkey}, "
            f"end_price={self.end_price})"
        )

class LBPair:
    bump_seed: List[int]
    bin_step_seed: List[int]
    pair_type: int
    active_id: int
    bin_step: int
    status: int
    require_base_factor_seed: int
    base_factor_seed: List[int]
    token_x_mint: str
    token_y_mint: str
    padding1: List[int]
    padding2: List[int]
    fee_owner: Pubkey
    base_key: str

    def __init__(self, data: dict) -> None:
        self.bump_seed = data["bumpSeed"]
        self.bin_step_seed = data["binStepSeed"]
        self.pair_type = data["pairType"]
        self.active_id = data["activeId"]
        self.bin_step = data["binStep"]
        self.status = data["status"]
        self.require_base_factor_seed = data["requireBaseFactorSeed"]
        self.base_factor_seed = data["baseFactorSeed"]
        self.token_x_mint = data["tokenXMint"]
        self.token_y_mint = data["tokenYMint"]
        self.padding1 = data["padding1"]
        self.padding2 = data["padding2"]
        if "feeOwner" in data:
            self.fee_owner = Pubkey.from_string(data["feeOwner"])
        else:
            logger.warning("feeOwner field not found in LBPair data")
            self.fee_owner = Pubkey.from_string("11111111111111111111111111111111")
        self.base_key = data["baseKey"]
        
@dataclass
class TokenReserve():
    public_key: Pubkey
    reserve: Pubkey
    amount: str
    decimal: int

    def __init__(self, data: dict) -> None:
        self.public_key = Pubkey.from_string(data["publicKey"])
        self.reserve = Pubkey.from_string(data["reserve"])
        self.amount = data["amount"]
        self.decimal = data["decimal"]

@dataclass
class PositionInfo():
    public_key: Pubkey
    lb_pair: Any
    token_x: TokenReserve
    token_y: TokenReserve
    lb_pair_positions_data: List[Position]

    def __init__(self, data: dict) -> None:
        self.public_key = Pubkey.from_string(data["publicKey"])
        self.lb_pair = data["lbPair"]
        self.token_x = TokenReserve(data["tokenX"])
        self.token_y = TokenReserve(data["tokenY"])
        self.lb_pair_positions_data = [Position(position) for position in data["lbPairPositionsData"]]

@dataclass
class FeeInfo():
    base_fee_rate_percentage: float
    max_fee_rate_percentage: float
    protocol_fee_percentage: float

    def __init__(self, data: dict) -> None:
        self.base_fee_rate_percentage = float(data["baseFeeRatePercentage"])
        self.max_fee_rate_percentage = float(data["maxFeeRatePercentage"])
        self.protocol_fee_percentage = float(data["protocolFeePercentage"])

@dataclass
class BinLiquidty():
    bin_id: int
    x_amount: str
    y_amount: str
    supply: str
    version: int
    price: str
    price_per_token: str

    def __init__(self, data: dict) -> None:
        if data.get("binId") is None:
            raise AttributeError("binId is required")
        if data.get("xAmount") is None:
            raise AttributeError("xAmount is required")
        if data.get("yAmount") is None:
            raise AttributeError("yAmount is required")
        if data.get("supply") is None:
            raise AttributeError("supply is required")
        if data.get("version") is None:
            raise AttributeError("version is required")
        if data.get("price") is None:
            raise AttributeError("price is required")
        
        self.bin_id = int(data["binId"])
        self.x_amount = data["xAmount"]
        self.y_amount = data["yAmount"]
        self.supply = data["supply"]
        self.version = int(data["version"])
        self.price = data["price"]
        self.price_per_token = data["pricePerToken"]

@dataclass
class GetBins():
    active_bin: int
    bin_liquidty: List[BinLiquidty]

    def __init__(self, data: dict) -> None:
        if data.get("activeBin") is None:
            raise AttributeError("activeBin is required")
        
        if data.get("bins") is None:
            raise AttributeError("bins is required")
        
        self.active_bin = int(data["activeBin"])
        self.bin_liquidty = [BinLiquidty(bin_data) for bin_data in data["bins"]]