import ethers from "ethers";
import dotenv from "dotenv";
import { SpookyABI, PairABI, ERC20ABI, TombABI } from "./abi.js";
import fetch from "node-fetch";

dotenv.config();

const spookyContractAddress = "0xF491e7B69E4244ad4002BC14e878a34207E38c29";
const VSHAREPairContractAddress = "0x79a50B4487d120eC0C9634b6729d9983fe5F0439";
const BFTMContractAddress = "0xdc79AFCe5AE2300834B2bB575bC40cF78EF7b5e3";
const VSHAREContractAddress = "0xF99231D26437a5A24928fbF2cB4424d1F8010EA1";
const VAMPContractAddress = "0xA91ADe2730bF6041ce9DE1Ba9cB22eE7Fea2B009";
const TombContractAddress = "0x9476f226E76aeBED38176ef7CBe0b08E99942bBd";
const WFTMContractAddress = "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83";

async function main() {
  console.log("INITIALIZING TOMB COMPOUNDER");
  const walletPk = process.env.WALLET_PK;
  if (!walletPk) throw "WALLET_PK UNDEFINED";

  const ftmProvider = new ethers.providers.JsonRpcProvider(
    "https://rpc.ankr.com/fantom"
  );
  const Wallet = new ethers.Wallet(walletPk, ftmProvider);

  const BFTMContract = new ethers.Contract(
    BFTMContractAddress,
    ERC20ABI,
    Wallet
  );
  const VSHAREContract = new ethers.Contract(
    VSHAREContractAddress,
    ERC20ABI,
    Wallet
  );
  const VAMPContract = new ethers.Contract(
    VAMPContractAddress,
    ERC20ABI,
    Wallet
  );
  const SpookyContract = new ethers.Contract(
    spookyContractAddress,
    SpookyABI,
    Wallet
  );
  const VSHAREPairContract = new ethers.Contract(
    VSHAREPairContractAddress,
    PairABI,
    Wallet
  );
  const WFTMContract = new ethers.Contract(
    WFTMContractAddress,
    ERC20ABI,
    Wallet
  );

  const TombContract = new ethers.Contract(
    TombContractAddress,
    TombABI,
    Wallet
  );
  console.log("##############CONTRACTS INITIALIZED##############");

  const gas = await checkGas();
  await claim(TombContract, 1, gas);
  const bal = await Wallet.getBalance();
  const form = ethers.utils.formatEther(bal);
  console.log("ftm bal", Number(form));
  if (Number(form) < 500) {
    await sell(SpookyContract, VSHAREContract, WFTMContract, Wallet, gas);
  }
  await addLiquidity(
    SpookyContract,
    VSHAREPairContract,
    VSHAREContract,
    WFTMContract,
    Wallet,
    gas
  );
  await deposit(TombContract, 1, VSHAREPairContract, Wallet, gas);

  setInterval(async () => {
    const gas = await checkGas();
    await claim(TombContract, 1, gas);
    const bal = await Wallet.getBalance();
    const form = ethers.utils.formatEther(bal);
    if (Number(form) < 500) {
      await sell(SpookyContract, VSHAREContract, WFTMContract, Wallet, gas);
    }
    await addLiquidity(
      SpookyContract,
      VSHAREPairContract,
      VSHAREContract,
      WFTMContract,
      Wallet,
      gas
    );
    await deposit(TombContract, 1, VSHAREPairContract, Wallet, gas);
  }, 600000);
}

async function claim(contract, pool, gas) {
  console.log("\n ##############CLAIMING##############");
  const claim = await contract.withdraw(pool, 0, {
    gasPrice: gas,
  });
  await claim.wait(1);
  console.log("\n ##############CLAIMED##############");
}

async function deposit(contract, pool, lpToken, Wallet, gas) {
  console.log("\n ##############DEPOSITING##############");
  const balance = await lpToken.balanceOf(Wallet.address);
  const deposit = await contract.deposit(pool, balance, {
    gasPrice: gas,
    gasLimit: 140000,
  });
  await deposit.wait(1);
  console.log("\n ##############DEPOSITED##############");
}

async function sell(amm, tokenIn, tokenOut, Wallet, gas) {
  const balance = await tokenIn.balanceOf(Wallet.address);
  const balanceIn = balance.div(ethers.BigNumber.from(2));

  const swapPath = [tokenIn.address, tokenOut.address];
  const amountOut = await amm.getAmountsOut(balanceIn, swapPath);
  const amountsOutMin = amountOut[1]
    .mul(ethers.BigNumber.from(90))
    .div(ethers.BigNumber.from(100));

  const formatted = Number(ethers.utils.formatEther(balanceIn)) / 10 ** 18;
  console.log(`\nSelling ${formatted}$VSHARE`);

  const swap = await amm.swapExactTokensForETH(
    balanceIn,
    amountsOutMin,
    swapPath,
    Wallet.address,
    Math.floor(Date.now() / 1000) + 60 * 30, // 30 minutes
    { gasPrice: gas, gasLimit: 300000 }
  );
  await swap.wait(1);
  console.log("\nSOLD");
}

async function addLiquidity(amm, pair, tokenA, tokenB, Wallet, gas) {
  const resersves = await pair.getReserves();
  const ftmReserves = Number(ethers.utils.formatEther(resersves[0]));
  const vshareReserves = Number(ethers.utils.formatEther(resersves[1]));

  const ftmPerVshareRate = ftmReserves / vshareReserves;
  const vshareBalance = await tokenA.balanceOf(Wallet.address);
  const vshareMin = vshareBalance
    .mul(ethers.BigNumber.from(90))
    .div(ethers.BigNumber.from(100));
  const ftmToDepo = ethers.utils.parseEther(
    ((Number(vshareBalance) / 10 ** 18) * ftmPerVshareRate).toString()
  );
  const ftmMin = ftmToDepo
    .mul(ethers.BigNumber.from(90))
    .div(ethers.BigNumber.from(100));

  console.log("\n ##############ADDING LIQUIDITY##############");
  const add = await amm.addLiquidityETH(
    tokenA.address,
    vshareMin.mul(ethers.BigNumber.from(105)).div(ethers.BigNumber.from(100)),
    vshareMin,
    ftmMin,
    Wallet.address,
    Math.floor(Date.now() / 1000) + 60 * 30, // 30 minutes
    {
      gasPrice: gas,
      gasLimit: 300000,
      value: ftmToDepo,
    }
  );
  await add.wait(1);
  console.log("\n ##############ADDED LIQUIDITY##############");
}

async function checkGas() {
  const gasRequest = await fetch(
    "https://api.ftmscan.com/api?module=gastracker&action=gasoracle&apikey=4RJR3MY5XZU2KEYVI94R45GIWT3URCXKXR"
  );
  const gasResponse = await gasRequest.json();
  let gasPrice = gasResponse.result.ProposeGasPrice;
  return ethers.utils.parseUnits(gasPrice, "gwei");
}

main().catch((err) => {
  console.log("\n -----------THERE WAS AN ERROR-----------");
  main();
});
