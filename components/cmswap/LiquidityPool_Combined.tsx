'use client'
import React, { useState, useEffect } from 'react';
import { ChevronDown, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { FiGrid, FiList } from 'react-icons/fi';
import { simulateContract, waitForTransactionReceipt, writeContract, readContract, readContracts, getBalance, sendTransaction, type WriteContractErrorType } from '@wagmi/core';
import { config } from '@/config/reown';
import { useAccount } from 'wagmi';
import { jbc, bitkub, monadTestnet, bitkubTestnet } from 'viem/chains';
import {
  formatEther,
  parseEther,
  erc20Abi,
  createPublicClient,
  http,
  encodeAbiParameters,
  keccak256,
} from 'viem';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

import StakingV3Modal from './StakingV3Modal';
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePrice } from '@/context/getPrice';

type ThemeId = 96 | 8899 | 56 | 3501 | 10143 | 25925;
type Theme = {
  primary: string;
  secondary: string;
  accent: string;
  glow: string;
  border: string;
  text: string;
  bg: string;
};

type ChainConfig = {
  chain: typeof bitkub | typeof jbc | typeof monadTestnet | typeof bitkubTestnet;
  chainId: ThemeId;
  explorer: string;
  rpc: string;
  blocktime: number;
  tokens: { name: string; value: string; logo: string }[];
  lib: {
    v3FactoryContract: any;
    erc20ABI: any;
    v3PoolABI: any;
    V3_FACTORY: string;
    V3_FACTORYCreatedAt: bigint;
    positionManagerContract: any;
    StakingFactoryV3Contract?: any;
    StakingFactoryV3_Addr?:  "0xstring";
    StakingFactoryV3CreatedAt?: bigint;
    v3StakerContract?: any;
  };
};

const themes: Record<ThemeId, Theme> = {
  96: {
    primary: 'from-green-400 to-emerald-400',
    secondary: 'from-green-600 to-emerald-600',
    accent: 'green-400',
    glow: '',
    border: 'border-green-400/30',
    text: 'text-green-300',
    bg: 'bg-gradient-to-br from-slate-700 via-black to-emerald-900',
  },
  8899: {
    primary: 'from-blue-400 to-cyan-400',
    secondary: 'from-blue-600 to-cyan-600',
    accent: 'blue-400',
    glow: '',
    border: 'border-blue-400/30',
    text: 'text-blue-300',
    bg: 'bg-gradient-to-br from-slate-700 via-black to-emerald-900',
  },
  56: {
    primary: 'from-yellow-400 to-amber-400',
    secondary: 'from-yellow-600 to-amber-600',
    accent: 'yellow-400',
    glow: '',
    border: 'border-yellow-400/30',
    text: 'text-yellow-300',
    bg: 'bg-gradient-to-br from-slate-700 via-black to-emerald-900',
  },
  3501: {
    primary: 'from-red-400 to-rose-400',
    secondary: 'from-red-600 to-rose-600',
    accent: 'red-400',
    glow: '',
    border: 'border-red-400/30',
    text: 'text-red-300',
    bg: 'bg-gradient-to-br from-slate-700 via-black to-emerald-900',
  },
  10143: {
    primary: 'from-purple-400 to-violet-400',
    secondary: 'from-purple-600 to-violet-600',
    accent: 'purple-400',
    glow: '',
    border: 'border-purple-400/30',
    text: 'text-purple-300',
    bg: 'bg-gradient-to-br from-slate-700 via-black to-emerald-900',
  },
  25925: {
    primary: "from-green-400 to-emerald-400",
    secondary: "from-green-600 to-emerald-600",
    accent: "green-400",
    glow: "",
    border: "border-green-400/30",
    text: "text-green-500",
    bg: "bg-gradient-to-br from-slate-700 via-black to-emerald-900"
  },
};

const formatNumber = (num: number) => {
  if (num >= 1e9) return `$${(num / 1e9).toFixed(3)} B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(3)} M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(3)} K`;
  return `$${num.toFixed(3)}`;
};

const formatPercentage = (num: number) => `${num.toFixed(2)}%`;

export default function LiquidityPool({ chainConfig }: { chainConfig: ChainConfig }) {
  type SortField = 'liquidity' | 'volume24h' | 'fee24h' | 'apr' | 'name';
  const [sortBy, setSortBy] = useState<SortField>('liquidity');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  
  const tabParam = searchParams.get('tab');
  const [listFilter, setListFilter] = useState<any>(tabParam || 'allRP');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && tab !== listFilter) {
      setListFilter(tab);
    }
  }, [searchParams.get('tab'), listFilter]);

  const handleListFilterChange = (filter: string) => {
    setListFilter(filter);
    router.push(`${pathname}?tab=${filter}`);
  };

  const pageParam = searchParams.get('page');
  const currentPage = pageParam ? Math.max(1, parseInt(pageParam)) : 1;
  const itemsPerPage = 10;
  const [openStake, setOpenStake] = useState(false);
  const [selectedProgramAddr, setSelectedProgramAddr] = useState<`0x${string}` | null>(null);
  const [selectedIncentive, setSelectedIncentive] = useState<{ rewardToken: `0x${string}`; pool: `0x${string}`; startTime: bigint; endTime: bigint; refundee: `0x${string}` } | null>(null);
  const [stakeTokenId, setStakeTokenId] = useState('');
  const [withdrawTokenId, setWithdrawTokenId] = useState('');
  const [claimAmount, setClaimAmount] = useState('');
  const [view, setView] = useState<'table' | 'grid'>('table');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [validPools, setValidPools] = useState<{
      tokenA: string;
      tokenALogo: string;
      tokenAaddr: string;
      tokenB: string;
      tokenBLogo: string;
      tokenBaddr: string;
      fee: number;
      poolAddress: string;
      liquidity: number;
      volume24h: number;
      apr: number;
      fee24h: number;
      themeId: ThemeId;
      listed: boolean;
      stakingApr: number;
      poolApr: number;
    }[]
  >([]);

    const [stakingList, setStakingList] = useState<{
      name: string;
      tokenALogo: string;
      tokenBLogo: string;
      totalStaked: number;
      apr: number;
      stakingApr: number;
      poolApr: number;
      pending: string;
      staked: number;
      themeId: number;
      url : string;
      feeList: string[];
      chain: string;
      poolAddress: string;
      rewardToken?: string;
      startTime?: bigint;
      endTime?: bigint;
      refundee?: string;
  }[]>([]);

  const feeOptions = [100, 500, 3000, 10000];
  const { chainId,address } = useAccount();
  const selectedChainId = chainId || chainConfig.chainId;
  const { chain, rpc, blocktime, tokens, lib } = chainConfig;
  const { 
    v3FactoryContract, 
    positionManagerContract, 
    erc20ABI, 
    v3PoolABI, 
    StakingFactoryV3Contract, 
    StakingFactoryV3CreatedAt,
    v3StakerContract 
  } = lib;

  const { priceList } = usePrice();
  const theme = themes[selectedChainId as ThemeId] || themes[96];
  const [isMobile, setIsMobile] = useState(false);

  const publicClient = createPublicClient({
    chain,
    transport: http(rpc),
  });

  const publicClientTestnet = createPublicClient({
    chain: bitkubTestnet,
    transport: http('https://rpc-testnet.bitkubchain.io'),
  });

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const checkMobile = () => setIsMobile(window.innerWidth < 768);
      checkMobile();
      window.addEventListener("resize", checkMobile);
      return () => window.removeEventListener("resize", checkMobile);
    }
  }, []);

  // Initialize layout from URL and sync on toggle
  React.useEffect(() => {
    const v = searchParams?.get('view');
    if (v === 'grid' || v === 'table') {
      setView(v);
    }
  }, [searchParams]);

  const updateViewParam = (next: 'table' | 'grid') => {
    try {
      const current = new URLSearchParams(searchParams?.toString() ?? '');
      current.set('view', next);
      const qs = current.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    } catch {}
  };


  const handleClick = (url: string) => {
      if (isMobile) {
        router.push(url);
      } else {
        window.open(url, "_blank");
      }
    };

  const generatePairs = (tokens: { name: string; value: string; logo: string }[]) => {
    const pairs: [string, string][] = [];
    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        pairs.push([tokens[i].name, tokens[j].name]);
      }
    }
    return pairs;
  };

  React.useEffect(() => {
    setValidPools([])
    setListFilter('allLP') // Reset to All Liquidity when chain changes
  }, [chainConfig]);

  const computeIncentiveId = (opts: { rewardToken: `0x${string}`; pool: `0x${string}`; startTime: bigint; endTime: bigint; refundee: `0x${string}` }): `0x${string}` => {
    const encoded = encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'address' },
      ],
      [opts.rewardToken, opts.pool, opts.startTime, opts.endTime, opts.refundee]
    );
    return keccak256(encoded) as `0x${string}`;
  };

  React.useEffect(() => {
    if (!priceList || priceList.length < 2) return;

    const fetchPools = async () => {
      const CACHE_KEY = `liquidity_pools_v1_${chainId}`;
      let cachedData: { pools: typeof validPools; lastBlock: string } = { pools: [], lastBlock: "0" };

      // 1. Load from Cache
      try {
        const stored = localStorage.getItem(CACHE_KEY);
        if (stored) {
          cachedData = JSON.parse(stored);
          if (cachedData.pools && cachedData.pools.length > 0) {
            setValidPools(cachedData.pools);
            setLoadingProgress(10); // Cache Loaded
          }
        }
      } catch (e) {
        console.error("Failed to parse liquidity pool cache", e);
      }

      const latestBlock = await publicClient.getBlockNumber();
      const startBlock =
          cachedData.lastBlock && BigInt(cachedData.lastBlock) > lib.V3_FACTORYCreatedAt
            ? BigInt(cachedData.lastBlock) + BigInt(1)
            : lib.V3_FACTORYCreatedAt;

       // ---------------------------------------------------------
       // Helper: Refresh Stats for a Single Pool (24H Window)
       // ---------------------------------------------------------
       const getPoolStats = async (pool: any, currentBlock: bigint) => {
          try {
             if (!pool.poolAddress) return pool;
             
             // Daily block count (approx)
             const blockAmountDaily = BigInt(86400 / blocktime);
             const fromBlock = currentBlock > blockAmountDaily ? currentBlock - blockAmountDaily : BigInt(0);

             // 1. Fetch Current Balances (Liquidity)
             const poolStatus = await readContracts(config, {
                contracts: [
                  { abi: erc20Abi, address: pool.tokenAaddr as '0xstring', functionName: 'balanceOf', args: [pool.poolAddress] },
                  { abi: erc20Abi, address: pool.tokenBaddr as '0xstring', functionName: 'balanceOf', args: [pool.poolAddress] },
                ],
              });

             const tokenAamount = (poolStatus[0].result as bigint) ?? BigInt(0);
             const tokenBamount = (poolStatus[1].result as bigint) ?? BigInt(0);

             // 2. Fetch 24H Events (Transfer & Liquidity)
             const [logBuyData, logSellData, logAddLiquidity, logRemoveLiquidity] = await Promise.all([
                  publicClient.getContractEvents({
                    abi: erc20Abi,
                    address: pool.tokenAaddr as '0xstring',
                    eventName: 'Transfer',
                    args: { from: pool.poolAddress },
                    fromBlock: fromBlock,
                    toBlock: 'latest',
                  }),
                  publicClient.getContractEvents({
                    abi: erc20Abi,
                    address: pool.tokenAaddr as '0xstring',
                    eventName: 'Transfer',
                    args: { to: pool.poolAddress },
                    fromBlock: fromBlock,
                    toBlock: 'latest',
                  }),
                   publicClient.getContractEvents({
                    ...lib.positionManagerContract,
                    eventName: 'IncreaseLiquidity',
                    // Note: IncreaseLiquidity events are emitted from Position Manager, not the pool
                    // We cannot filter by pool address in the query, so we fetch all and filter below
                    fromBlock: fromBlock,
                    toBlock: 'latest',
                  }),
                  publicClient.getContractEvents({
                    ...lib.positionManagerContract,
                    eventName: 'DecreaseLiquidity',
                    // Note: DecreaseLiquidity events are emitted from Position Manager, not the pool
                    // We cannot filter by pool address in the query, so we fetch all and filter below
                    fromBlock: fromBlock,
                    toBlock: 'latest',
                  })
             ])

             // 3. Filter Liquidity Events to only those related to THIS pool
             // We check if the transaction has Transfer events involving this pool
             const poolTransferTxs = new Set([
                ...logBuyData.map((item: any) => item.transactionHash),
                ...logSellData.map((item: any) => item.transactionHash),
             ]);

             const relevantLiquidityTxs = new Set([
                ...logAddLiquidity
                   .filter((item: any) => poolTransferTxs.has(item.transactionHash))
                   .map((item: any) => item.transactionHash),
                ...logRemoveLiquidity
                   .filter((item: any) => poolTransferTxs.has(item.transactionHash))
                   .map((item: any) => item.transactionHash),
             ]);

             const BuyData = logBuyData.map((res: any) => ({
                value: Number(formatEther(res.args.value)),
                tx: res.transactionHash,
             }));

             const SellData = logSellData.map((res: any) => ({
                value: Number(formatEther(res.args.value)),
                tx: res.transactionHash,
             }));

             const filteredBuyData = BuyData.filter((item: any) => !relevantLiquidityTxs.has(item.tx));
             const filteredSellData = SellData.filter((item: any) => !relevantLiquidityTxs.has(item.tx));
             
             const volumeToken = [...filteredBuyData, ...filteredSellData].reduce((sum: number, tx: any) => sum + tx.value, 0);

             // Calculate USD Values
             const priceA = priceList.find(p => p.token === pool.tokenA)?.priceUSDT ?? 0;
             const priceB = priceList.find(p => p.token === pool.tokenB)?.priceUSDT ?? 0;
             
             const balanceA = Number(formatEther(tokenAamount));
             const balanceB = Number(formatEther(tokenBamount));
             const liquidityUSD = (balanceA * priceA) + (balanceB * priceB);
             
             const volumeUSD = volumeToken * priceA; // Assuming volume is calculated in Token A
             const feeRate = Number(pool.fee) / 1_000_000;
             const fee24h = volumeUSD * feeRate;
             const apr = liquidityUSD > 0 ? ((fee24h * 365) / liquidityUSD) * 100 : 0;

             return {
                 ...pool,
                 liquidity: liquidityUSD,
                 volume24h: volumeUSD,
                 fee24h: fee24h,
                 apr: apr,
                 poolApr: apr
             };

          } catch (e) {
              console.error(`Failed to update stats for pool ${pool.tokenA}/${pool.tokenB}`, e);
              return pool;
          }
       };

      setLoadingProgress(20); // Start Fetching

      // ---------------------------------------------------------
      // A. Discover NEW Pools (Incremental)
      // ---------------------------------------------------------
      let newResults: any[] = [];
      
      if (startBlock <= latestBlock) {
          const logCreateData = await publicClient.getContractEvents({
            ...lib.v3FactoryContract,
            eventName: 'PoolCreated',
            fromBlock: startBlock,
            toBlock: 'latest',
          });

          if (logCreateData.length > 0) {
             setLoadingProgress(40);
             const CreateData = logCreateData.map((res: any) => ({
                token0: res.args.token0 as '0xstring',
                token1: res.args.token1 as '0xstring',
                fee: res.args.fee as '0xstring',
                pool: res.args.pool as '0xstring',
             }));

             const currencyTokens = [tokens[2].value, tokens[1].value, tokens[3].value];
             
             for (const item of CreateData) {
                // Discovery Logic (Symbols, Listings)
                let isListed = true;
                let tokenA = tokens.find(t => t.value.toLowerCase() === item.token0.toLowerCase());
                let tokenB = tokens.find(t => t.value.toLowerCase() === item.token1.toLowerCase());

                if (!tokenA) {
                    isListed = false;
                    try {
                        const [symbolA] = await readContracts(config, { contracts: [{ abi: erc20Abi, address: item.token0, functionName: 'symbol' }] });
                         tokenA = { name: symbolA.result as string ?? 'UNK', value: item.token0, logo: 'https://cmswap.mypinata.cloud/ipfs/bafkreiexe7q5ptjflrlccf3vtqdbpwk36j3emlsulksx7ot52e3uqyqu3u' };
                    } catch { tokenA = { name: 'UNK', value: item.token0, logo: '' } }
                }

                if (!tokenB) {
                    isListed = false;
                    try {
                        const [symbolB] = await readContracts(config, { contracts: [{ abi: erc20Abi, address: item.token1, functionName: 'symbol' }] });
                         tokenB = { name: symbolB.result as string ?? 'UNK', value: item.token1, logo: 'https://cmswap.mypinata.cloud/ipfs/bafkreiexe7q5ptjflrlccf3vtqdbpwk36j3emlsulksx7ot52e3uqyqu3u' };
                    } catch { tokenB = { name: 'UNK', value: item.token1, logo: '' } }
                }

                // Normalise Order
                let tokenAobj = tokenA;
                let tokenBobj = tokenB;
                const a = currencyTokens.indexOf(tokenAobj.value);
                const b = currencyTokens.indexOf(tokenBobj.value);
                if ((a !== -1 && b === -1) || (a !== -1 && b !== -1 && b < a)) {
                    [tokenAobj, tokenBobj] = [tokenBobj, tokenAobj];
                }

                newResults.push({
                    tokenA: tokenAobj.name,
                    tokenALogo: tokenAobj.logo,
                    tokenAaddr: tokenAobj.value,
                    tokenB: tokenBobj.name,
                    tokenBLogo: tokenBobj.logo,
                    tokenBaddr: tokenBobj.value,
                    fee: Number(item.fee),
                    poolAddress: item.pool,
                    liquidity: 0, 
                    volume24h: 0,
                    fee24h: 0,
                    apr: 0,
                    stakingApr: 0,
                    poolApr: 0,
                    themeId: chainConfig.chainId,
                    listed: isListed,
                });
             }
          }
      }

      // ---------------------------------------------------------
      // B. Refresh Stats for ALL Pools (Cached + New)
      // ---------------------------------------------------------
      setLoadingProgress(60); 
      
      const combinedPools = [...cachedData.pools, ...newResults];
      // Deduplicate
      const uniquePoolsRaw = Array.from(new Map(combinedPools.map(p => [p.poolAddress.toLowerCase(), p])).values());

      // Update 24H Stats for every pool
      const updatedPools = await Promise.all(
          uniquePoolsRaw.map(async (pool, idx) => {
              // Throttle slightly or just run parallel. 
              // React sets state frequently, so this is fine.
              if (idx % 5 === 0 && uniquePoolsRaw.length > 5) {
                   setLoadingProgress(60 + Math.floor((idx / uniquePoolsRaw.length) * 35));
              }
              return getPoolStats(pool, latestBlock);
          })
      );

      setValidPools(updatedPools);
      setLoadingProgress(100);
      
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          pools: updatedPools,
          lastBlock: latestBlock.toString(),
        })
      );

      console.log('Valid pools refreshed:', updatedPools);
      return updatedPools;
    };

    const fetchPrograms = async (pools: typeof validPools) => {
      const stakingContract = StakingFactoryV3Contract || v3StakerContract;
      const stakingCreatedAt = StakingFactoryV3CreatedAt || lib.V3_FACTORYCreatedAt || BigInt(0);

      if (!stakingContract) {
        console.warn('Staking contract not defined for this chain');
        return;
      }

      try {
        // 1. Fetch all created incentives
        const created: any[] = await publicClient.getContractEvents({
          ...stakingContract,
          eventName: 'IncentiveCreated',
          fromBlock: stakingCreatedAt,
          toBlock: 'latest',
        }) as any[];

        console.log('IncentiveCreated events:', created);

        // 2. Fetch user's staked NFTs (Transfer to StakingFactoryV3)
        let myStakedTokenIds: bigint[] = [];
        if (address) {
           // Let's try to use the explicit ABI if available or fallback
           const transferEvents = await publicClient.getContractEvents({
            ...lib.positionManagerContract, // Use position manager contract definition
            eventName: 'Transfer',
            args: { to: stakingContract.address },
            fromBlock: stakingCreatedAt, 
            toBlock: 'latest',
          }) as any[];

          console.log('User transfer events:', transferEvents);
          const uniqueIds = [...new Set(transferEvents.map(obj => obj.args.tokenId))];
          
          // Verify ownership (deposits)
          if (uniqueIds.length > 0) {
            const deposits = await readContracts(config, {
              contracts: uniqueIds.map(id => ({ ...stakingContract, functionName: 'deposits', args: [id] }))
            });
            myStakedTokenIds = uniqueIds.filter((_, i) => {
              const res = deposits[i].result as unknown as [string, bigint, bigint, bigint][];
              return res && res[0] && res[0].toString().toUpperCase() === address.toUpperCase();
            }) as bigint[];
          }
        }

        const items: typeof stakingList = [];
        for (const ev of created) {
          const rewardToken = (ev.args.key?.rewardToken ?? ev.args.rewardToken) as '0xstring';
          const poolAddr = (ev.args.key?.pool ?? ev.args.pool) as '0xstring';
          const startTime = BigInt(ev.args.key?.startTime ?? ev.args.startTime ?? 0);
          const endTime = BigInt(ev.args.key?.endTime ?? ev.args.endTime ?? 0);
          const refundee = (ev.args.key?.refundee ?? ev.args.refundee) as '0xstring';

          // Compute Incentive ID
          const incentiveId = computeIncentiveId({ rewardToken, pool: poolAddr, startTime, endTime, refundee });

          // Fetch Incentive Stats (Total Staked, etc.)
          let totalStakedGlobal = 0;
          let totalRewardAmount = BigInt(0);
          try {
            const stat = await readContract(config, { ...stakingContract, functionName: 'incentives', args: [incentiveId] }) as any;
            if (stat) {
              if (stat[2] !== undefined) totalStakedGlobal = Number(stat[2]);
              if (stat[0] !== undefined) totalRewardAmount = BigInt(stat[0]);
            }
          } catch {}

          // Calculate User Rewards & Staked Count for this Incentive
          let myPendingWei = BigInt(0);
          let myStakedCount = 0;

          if (myStakedTokenIds.length > 0) {
            // Check which of my tokens are staked in THIS incentive
            const stakeChecks = await readContracts(config, {
              contracts: myStakedTokenIds.map(tid => ({ ...stakingContract, functionName: 'stakes', args: [tid, incentiveId] }))
            });
            
            const myTokensInThisIncentive: bigint[] = [];
            for (let i = 0; i < myStakedTokenIds.length; i++) {
              const st = stakeChecks[i].result;
              let isStaked = false;
              if (Array.isArray(st)) {
                isStaked = st.some((v) => { try { return (typeof v === 'bigint' && v > BigInt(0)) || (typeof v === 'number' && v > 0); } catch { return false; } });
              } else if (st && typeof st === 'object') {
                isStaked = Object.values(st).some((v: any) => { try { return (typeof v === 'bigint' && v > BigInt(0)) || (typeof v === 'number' && v > 0); } catch { return false; } });
              }
              if (isStaked) myTokensInThisIncentive.push(myStakedTokenIds[i]);
            }

            myStakedCount = myTokensInThisIncentive.length;

            if (myStakedCount > 0) {
              const rewards = await readContracts(config, {
                contracts: myTokensInThisIncentive.map(tid => ({
                  ...stakingContract,
                  functionName: 'getRewardInfo',
                  args: [{ rewardToken, pool: poolAddr, startTime, endTime, refundee }, tid]
                }))
              });
              
              for (const r of rewards) {
                if (r.status === 'success' && r.result) {
                  const res: any = r.result;
                  let rewardAmt = BigInt(0);
                   if (Array.isArray(res) && res.length > 0 && typeof res[0] === 'bigint') rewardAmt = res[0];
                   else if (typeof res === 'bigint') rewardAmt = res;
                   myPendingWei += rewardAmt;
                }
              }
            }
          }

          try {
            const [t0, t1, feeRes] = await readContracts(config, {
              contracts: [
                { ...v3PoolABI, address: poolAddr, functionName: 'token0' },
                { ...v3PoolABI, address: poolAddr, functionName: 'token1' },
                { ...v3PoolABI, address: poolAddr, functionName: 'fee' },
              ],
            });

            const token0Addr = t0.result as string;
            const token1Addr = t1.result as string;
            const fee = Number(feeRes.result ?? 0);

            const tA = chainConfig.tokens.find(t => t.value.toLowerCase() === token0Addr.toLowerCase());
            const tB = chainConfig.tokens.find(t => t.value.toLowerCase() === token1Addr.toLowerCase());

            // Resolve reward token name
            let rewardName: string | undefined = chainConfig.tokens.find(t => t.value.toLowerCase() === (rewardToken as string).toLowerCase())?.name;
            if (!rewardName) {
              try {
                const [sym] = await readContracts(config, {
                  contracts: [
                    { abi: erc20Abi, address: rewardToken as '0xstring', functionName: 'symbol' },
                  ],
                });
                if (sym?.status === 'success' && sym.result) rewardName = String(sym.result);
              } catch {}
            }
            const rewardLabel = rewardName ?? `${rewardToken.slice(0,6)}...${rewardToken.slice(-4)}`;

            // APR Calculation
            let stakingApr = 0;
            let poolApr = 0;
            let totalApr = 0;

            const poolData = pools.find(p => p.poolAddress.toLowerCase() === poolAddr.toLowerCase());
            if (poolData) {
              poolApr = poolData.apr;
              const liquidityUSD = poolData.liquidity;

              if (liquidityUSD > 0) {
                const rewardTokenPrice = priceList.find(p => p.token === rewardName || p.token === rewardLabel)?.priceUSDT ?? 0;
                const durationSeconds = Number(endTime - startTime);
                if (durationSeconds > 0) {
                  const totalRewardStr = formatEther(totalRewardAmount);
                  const totalReward = Number(totalRewardStr);
                  const rewardPerSec = totalReward / durationSeconds;
                  const rewardPerYear = rewardPerSec * 31536000; // 365 * 24 * 3600
                  const rewardYearlyUSD = rewardPerYear * rewardTokenPrice;
                  stakingApr = (rewardYearlyUSD / liquidityUSD) * 100;
                }
              }
            }
            totalApr = stakingApr + poolApr;

            items.push({
              name: `Staking ${(tA?.name ?? 'Token0')}-${(tB?.name ?? 'Token1')} earn ${rewardLabel}`,
              tokenALogo: tA?.logo || 'https://cmswap.mypinata.cloud/ipfs/bafkreiexe7q5ptjflrlccf3vtqdbpwk36j3emlsulksx7ot52e3uqyqu3u',
              tokenBLogo: tB?.logo || 'https://cmswap.mypinata.cloud/ipfs/bafkreiexe7q5ptjflrlccf3vtqdbpwk36j3emlsulksx7ot52e3uqyqu3u',
              totalStaked: totalStakedGlobal,
              apr: totalApr,
              stakingApr,
              poolApr,
              pending: formatEther(myPendingWei), // Full precision string
              staked: myStakedCount,
              themeId: chainConfig.chainId,
              url: `/staking/${poolAddr}`,
              feeList: [ `${(fee/10000).toFixed(2)}%` ],
              chain: (chain as any)?.name ?? 'Bitkub Testnet',
              poolAddress: poolAddr as string,
              rewardToken,
              startTime,
              endTime,
              refundee,
            });
          } catch {
            items.push({
              name: `Staking ${poolAddr.slice(0,6)}... earn ...`,
              tokenALogo: 'https://cmswap.mypinata.cloud/ipfs/bafkreiexe7q5ptjflrlccf3vtqdbpwk36j3emlsulksx7ot52e3uqyqu3u',
              tokenBLogo: 'https://cmswap.mypinata.cloud/ipfs/bafkreiexe7q5ptjflrlccf3vtqdbpwk36j3emlsulksx7ot52e3uqyqu3u',
              totalStaked: totalStakedGlobal,
              apr: 0,
              stakingApr: 0,
              poolApr: 0,
              pending: formatEther(myPendingWei),
              staked: myStakedCount,
              themeId: chainConfig.chainId,
              url: `/staking/${poolAddr}`,
              feeList: [],
              chain: (chain as any)?.name ?? 'Bitkub Testnet',
              poolAddress: poolAddr as string,
              rewardToken,
              startTime,
              endTime,
              refundee,
            });
          }
        }

        setStakingList(items);

        // Update validPools with the highest staking APR found for each pool
        const poolMaxStakingMap = new Map<string, number>();
        for (const item of items) {
            const pAddr = item.poolAddress.toLowerCase();
            const currMax = poolMaxStakingMap.get(pAddr) || 0;
            if (item.stakingApr > currMax) {
                poolMaxStakingMap.set(pAddr, item.stakingApr);
            }
        }

        const updatedPools = pools.map(p => {
             const pAddr = p.poolAddress.toLowerCase();
             const maxStakingApr = poolMaxStakingMap.get(pAddr) || 0;
             // Ensure we don't double count if logic runs multiple times, 
             // but here we are recalculating derived state.
             const totalApr = p.poolApr + maxStakingApr;
             
             return {
                 ...p,
                 stakingApr: maxStakingApr,
                 apr: totalApr
             }
        });
        
        // Only update if there's a difference to avoid loops? 
        // fetchPrograms is called once at the end of fetchPools.
        setValidPools(updatedPools);

      } catch (e) {
        console.error('fetchPrograms (UniswapV3Staking) error:', e);
        setStakingList([]);
      }
    };

    const run = async () => {
      const pools = await fetchPools();
      await fetchPrograms(pools);
    };
    run();
  }, [priceList, chainConfig, address]); // Added address dependency to re-fetch when user connects/changes account

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const sortedPools = [...validPools]
    .filter(pool => {
      if (listFilter === 'listedLP') return pool.listed === true;
      if (listFilter === 'unlistedLP') return pool.listed === false;
      return true;
    })
    .sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      if (sortBy === 'name') {
        aVal = `${a.tokenA}/${a.tokenB}`;
        bVal = `${b.tokenA}/${b.tokenB}`;
        if (sortOrder === 'desc') {
          return (bVal as string).localeCompare(aVal as string);
        }
        return (aVal as string).localeCompare(bVal as string);
      } else {
        aVal = a[sortBy as Exclude<SortField, 'name'>];
        bVal = b[sortBy as Exclude<SortField, 'name'>];
        if (sortOrder === 'desc') {
          return (bVal as number) - (aVal as number);
        }
        return (aVal as number) - (bVal as number);
      }
    });


  
  const totalPoolPages = Math.ceil(sortedPools.length / itemsPerPage);
  const paginatedPools = sortedPools.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const sortedStaking = [...stakingList]
    .filter(pool => {
      if (listFilter === 'myRP') return pool.staked > 0;
      return true;
    });

  const totalStakingPages = Math.ceil(sortedStaking.length / itemsPerPage);
  const paginatedStaking = sortedStaking.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return <ChevronDown className="w-4 h-4 opacity-50" />;
    return sortOrder === 'desc' ?
      <TrendingDown className="w-4 h-4 text-cyan-400" /> :
      <TrendingUp className="w-4 h-4 text-cyan-400" />;
  };

  return (
    <>
    <div className={`min-h-screen ${theme.bg}`}>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 mt-[120px]">
          <h1 className={`text-4xl font-bold bg-gradient-to-r ${theme.primary} bg-clip-text text-transparent mb-2 flex items-center gap-4`}>
            Liquidity Pools
            {loadingProgress < 100 && (
                <Loader2 className="w-6 h-6 animate-spin text-slate-400 opacity-80" />
            )}
          </h1>
          <p className="text-slate-400">Provide liquidity and earn fees</p>
        </div>
        <div className="mt-4 mb-4 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="backdrop-blur-xl rounded-xl border border-slate-700/50 p-6">
            <h3 className="text-slate-400 text-sm font-medium mb-2">Total Value Locked</h3>
            <p className="text-2xl font-bold text-white">
              {formatNumber(validPools.reduce((sum, pool) => sum + pool.liquidity, 0))}
            </p>
          </div>
          <div className="backdrop-blur-xl rounded-xl border border-slate-700/50 p-6">
            <h3 className="text-slate-400 text-sm font-medium mb-2">24H Volume</h3>
            <p className="text-2xl font-bold text-cyan-400">
              {formatNumber(validPools.reduce((sum, pool) => sum + pool.volume24h, 0))}
            </p>
          </div>
          <div className="backdrop-blur-xl rounded-xl border border-slate-700/50 p-6">
            <h3 className="text-slate-400 text-sm font-medium mb-2">24H Fees</h3>
            <p className="text-2xl font-bold text-green-400">
              {formatNumber(validPools.reduce((sum, pool) => sum + pool.fee24h, 0))}
            </p>
          </div>
                
        </div>
     <div className="my-4">
                {['allRP', 'myRP'].includes(listFilter) && (
                  <div className="flex justify-end mb-4">
                    <Button
                        variant="outline"
                        className={`font-mono h-auto rounded-xl text-xs flex flex-col bg-[#162638] text-[#00ff9d] border-${theme.accent}/20 hover:bg-${theme.accent}/10 text-black`}
                      >
                        <Link href="/earn/create" className="text-white/60 hover:text-[#32ffa7] text-xs flex items-center gap-1 font-mono">
                          <span >Create Staking Program</span>
                        </Link>
            
                    </Button>
                  </div>
                )}
      {/* --- PC --- */}
      <div className="hidden sm:flex items-center justify-between gap-3">
        <div
          className={`flex items-center gap-1.5 p-1 rounded-full w-fit border ${theme.border} shadow-inner shadow-${theme.accent}/10 backdrop-blur-md bg-[#061f1c]`}
        >
          {[
            { label: 'ALL Reward', value: 'allRP', show: selectedChainId === 1 || selectedChainId === 25925 || selectedChainId === 96 },
            { label: 'My Reward', value: 'myRP', show: selectedChainId === 1 || selectedChainId === 25925 || selectedChainId === 96 },
            { label: 'All Liquidity', value: 'allLP', show: true },
            { label: 'Listed', value: 'listedLP', show: true },
            { label: 'Not Listed', value: 'unlistedLP', show: true },
          ].filter(i => i.show).map(({ label, value }) => (
            <button
              key={value}
              onClick={() => handleListFilterChange(value)}
              className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-200
                ${listFilter === value
                  ? `bg-gradient-to-r ${theme.primary} text-black shadow-lg shadow-${theme.accent}/30`
                  : `${theme.text} hover:text-white hover:bg-${theme.accent}/10`
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Layout toggle (PC) */}
        <div className={`hidden lg:flex items-center gap-1.5 p-1 rounded-full border ${theme.border} bg-[#061f1c] shadow-inner shadow-${theme.accent}/10`}> 
          <button
            onClick={() => { setView('table'); updateViewParam('table'); }}
            className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-200 flex items-center gap-1.5 ${view === 'table' ? `bg-gradient-to-r ${theme.primary} text-black shadow` : `${theme.text} hover:text-white hover:bg-${theme.accent}/10`}`}
          >
            <FiList className={`h-4 w-4 ${view === 'table' ? 'text-black' : ''}`} />
            Table
          </button>
          <button
            onClick={() => { setView('grid'); updateViewParam('grid'); }}
            className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-200 flex items-center gap-1.5 ${view === 'grid' ? `bg-gradient-to-r ${theme.primary} text-black shadow` : `${theme.text} hover:text-white hover:bg-${theme.accent}/10`}`}
          >
            <FiGrid className={`h-4 w-4 ${view === 'grid' ? 'text-black' : ''}`} />
            Grid
          </button>
        </div>
      </div>

      {/* --- Mobile --- */}
    <div className="sm:hidden grid grid-cols-2 gap-2 mt-2">
      {[
        { label: 'ALL Reward', value: 'allRP', show: selectedChainId === 1 || selectedChainId === 25925 },
        { label: 'My Reward', value: 'myRP', show: selectedChainId === 1 || selectedChainId === 25925 },
        { label: 'All Liquidity', value: 'allLP', show: true },
        { label: 'Listed', value: 'listedLP', show: true },
        { label: 'Not Listed', value: 'unlistedLP', show: true },
      ].filter(i => i.show).map(({ label, value }) => (
        <button
          key={value}
          onClick={() => handleListFilterChange(value)}
          className={`p-3 text-xs font-medium rounded-xl border transition-all duration-200
            ${listFilter === value
              ? `bg-gradient-to-r ${theme.primary} text-black`
              : `text-gray-300 border-${theme.accent}/20 hover:bg-${theme.accent}/10`
            }`}
        >
          {label}
        </button>
      ))}
    </div>
  </div>

    {['allRP', 'myRP'].includes(listFilter) ?
      <div>
        {/* --- Desktop Table View (Reward) --- */}
        <div className="hidden lg:block">
          {view === 'table' ? (
           <div className="backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden">
            <div className="grid [grid-template-columns:1.5fr_1fr_1fr_1fr_1fr_auto] gap-4 p-6 border-b border-slate-700/50">
              <button onClick={() => handleSort('name')} className="flex items-center gap-2 text-left font-medium text-slate-300 hover:text-white transition-colors">
                Program Name <SortIcon field="name" />
              </button>
              <button onClick={() => handleSort('liquidity')} className="flex items-center gap-2 text-left font-medium text-slate-300 hover:text-white transition-colors">
                Total Stake <SortIcon field="liquidity" />
              </button>
              <button onClick={() => handleSort('volume24h')} className="flex items-center gap-2 text-left font-medium text-slate-300 hover:text-white transition-colors">
                APR <SortIcon field="volume24h" />
              </button>
              <button onClick={() => handleSort('fee24h')} className="flex items-center gap-2 text-left font-medium text-slate-300 hover:text-white transition-colors">
                Pending <SortIcon field="fee24h" />
              </button>
              <button onClick={() => handleSort('apr')} className="flex items-center gap-2 text-left font-medium text-slate-300 hover:text-white transition-colors">
                Your Stake <SortIcon field="apr" />
              </button>
              <div className="font-medium text-slate-300">Action</div>
            </div>
            <div className="divide-y divide-slate-700/30">
              {paginatedStaking.map((pool, index) => {
                const theme = themes[pool.themeId as ThemeId];
                return (
                  <div
                    key={index}
                    className="grid [grid-template-columns:1.5fr_1fr_1fr_1fr_1fr_auto] gap-4 p-6 hover:bg-slate-800/30 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative w-10 h-10">
                        <img src={pool.tokenALogo || '/default2.png'} alt="token1" className="w-8 h-8 rounded-full border-2 border-[#1a1b2e] bg-white z-0 absolute top-0 left-0" />
                        <img src={pool.tokenBLogo || '/default2.png'} alt="token2" className="w-6 h-6 rounded-full border-2 border-[#1a1b2e] bg-white z-10 absolute bottom-0 right-0" />
                      </div>
                      <div className="flex flex-col">
                        <div className="text-[10px] text-slate-400 mb-0.5 uppercase tracking-wide">{pool.chain}</div>
                        <div className={`font-semibold text-white group-hover:${theme.text} transition-colors`}>
                          {pool.name}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          Fee Tiers: {pool.feeList?.join(' , ')}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col justify-center">
                      <span className="text-white font-medium">{(pool.totalStaked)}</span>
                    </div>
                    <div className="flex flex-col justify-center">
                      <TooltipProvider>
                        <Tooltip delayDuration={0}>
                          <TooltipTrigger asChild>
                            <span className={`font-bold text-lg ${theme.text} cursor-help border-b border-dotted border-white/20 inline-block`}>{formatPercentage(pool.apr)}</span>
                          </TooltipTrigger>
                          <TooltipContent className="bg-slate-900 border-slate-700">
                             <div className="text-xs space-y-1">
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">Total APR:</span>
                                  <span className="font-bold text-white">{formatPercentage(pool.apr)}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">Reward APR:</span>
                                  <span className="font-bold text-green-400">{formatPercentage(pool.stakingApr)}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">LP APR:</span>
                                  <span className="font-bold text-blue-400">{formatPercentage(pool.poolApr)}</span>
                                </div>
                             </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="flex flex-col justify-center">
                      <span className="text-white font-medium">
                        {Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 8 }).format(Number(pool.pending))}
                      </span>
                    </div>
                    <div className="flex flex-col justify-center">
                      <span className="text-white font-medium">{(pool.staked)}</span>
                    </div>
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <Button variant="ghost" className="cursor-pointer px-2 py-1 text-xs" onClick={() => {
                        setSelectedProgramAddr(pool.poolAddress as `0x${string}`);
                        setSelectedIncentive({
                          rewardToken: pool.rewardToken as `0x${string}`,
                          pool: pool.poolAddress as `0x${string}`,
                          startTime: pool.startTime!,
                          endTime: pool.endTime!,
                          refundee: pool.refundee as `0x${string}`
                        });
                        setOpenStake(true);
                      }}>
                        Go Farm
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            {totalStakingPages > 1 && (
                <div className="flex justify-between items-center px-4 py-4 border-t border-slate-700/50">
                    <Button 
                        variant="ghost" 
                        disabled={currentPage === 1}
                        onClick={() => router.push(`${pathname}?page=${currentPage - 1}`)}
                    >
                        Previous
                    </Button>
                    <span className="text-slate-400 text-sm">
                        Page {currentPage} of {totalStakingPages}
                    </span>
                    <Button 
                        variant="ghost" 
                        disabled={currentPage === totalStakingPages}
                        onClick={() => router.push(`${pathname}?page=${currentPage + 1}`)}
                    >
                        Next
                    </Button>
                </div>
            )}
           </div>
          ) : (
            <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {paginatedStaking.map((pool, index) => {
                    const theme = themes[pool.themeId as ThemeId];
                    return (
                        <div
                        key={index}
                        className={`bg-slate-800/50 backdrop-blur-xl rounded-xl border ${theme.border} p-6 hover:bg-slate-800/70 transition-all cursor-pointer group relative overflow-hidden`}
                        >
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                            <div className="relative w-12 h-12">
                                <img src={pool.tokenALogo || '/default2.png'} alt="token1" className="w-10 h-10 rounded-full border-2 border-[#1a1b2e] bg-white z-0 absolute top-0 left-0" />
                                <img src={pool.tokenBLogo || '/default2.png'} alt="token2" className="w-8 h-8 rounded-full border-2 border-[#1a1b2e] bg-white z-10 absolute bottom-0 right-0" />
                            </div>
                            <div>
                                <div className="text-[10px] text-slate-400 mb-0.5 uppercase tracking-wide">{pool.chain}</div>
                                <div className={`font-bold text-lg text-white group-hover:${theme.text} transition-colors`}>
                                {pool.name}
                                </div>
                                <div className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300`}>
                                <span>Fee Tiers: {pool.feeList?.join(' , ')}</span>
                                </div>
                            </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <div className="text-xs text-slate-400 mb-1">Total Staked</div>
                                <div className="text-white font-medium">{pool.totalStaked}</div>
                            </div>
                            <div>
                                <div className="text-xs text-slate-400 mb-1">APR</div>
                                <TooltipProvider>
                                    <Tooltip delayDuration={0}>
                                        <TooltipTrigger asChild>
                                           <div className={`font-bold ${theme.text} cursor-help inline-block border-b border-dotted border-white/20`}>{formatPercentage(pool.apr)}</div>
                                        </TooltipTrigger>
                                        <TooltipContent className="bg-slate-900 border-slate-700">
                                            <div className="text-xs space-y-1">
                                                <div className="flex justify-between gap-4">
                                                <span className="text-slate-400">Total APR:</span>
                                                <span className="font-bold text-white">{formatPercentage(pool.apr)}</span>
                                                </div>
                                                <div className="flex justify-between gap-4">
                                                <span className="text-slate-400">Reward APR:</span>
                                                <span className="font-bold text-green-400">{formatPercentage(pool.stakingApr)}</span>
                                                </div>
                                                <div className="flex justify-between gap-4">
                                                <span className="text-slate-400">LP APR:</span>
                                                <span className="font-bold text-blue-400">{formatPercentage(pool.poolApr)}</span>
                                                </div>
                                            </div>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                            <div>
                                <div className="text-xs text-slate-400 mb-1">Pending</div>
                                <div className="text-white font-medium">{Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 8 }).format(Number(pool.pending))}</div>
                            </div>
                            <div>
                                <div className="text-xs text-slate-400 mb-1">Your Stake</div>
                                <div className="text-white font-medium">{pool.staked}</div>
                            </div>
                        </div>

                        <div className="flex gap-2 mt-auto pt-4 border-t border-slate-700/30">
                            <Button variant="secondary" className="flex-1 h-8 text-xs" onClick={() => {
                                setSelectedProgramAddr(pool.poolAddress as `0x${string}`);
                                setSelectedIncentive({
                                rewardToken: pool.rewardToken as `0x${string}`,
                                pool: pool.poolAddress as `0x${string}`,
                                startTime: pool.startTime!,
                                endTime: pool.endTime!,
                                refundee: pool.refundee as `0x${string}`
                                });
                                setOpenStake(true);
                            }}>
                                Go Farm
                            </Button>
                        </div>
                        </div>
                    );
                })}
             </div>
             {totalStakingPages > 1 && (
                <div className="flex justify-between items-center px-4 py-4 border-t border-slate-700/50">
                    <Button 
                        variant="ghost" 
                        disabled={currentPage === 1}
                        onClick={() => router.push(`${pathname}?page=${currentPage - 1}`)}
                    >
                        Previous
                    </Button>
                    <span className="text-slate-400 text-sm">
                        Page {currentPage} of {totalStakingPages}
                    </span>
                    <Button 
                        variant="ghost" 
                        disabled={currentPage === totalStakingPages}
                        onClick={() => router.push(`${pathname}?page=${currentPage + 1}`)}
                    >
                        Next
                    </Button>
                </div>
            )}
             </div>
          )}
        </div>

        {/* --- Mobile List View (Reward) --- */}
        <div className="lg:hidden space-y-3">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-white">Staking Programs</h2>
          </div>
          {sortedStaking.map((pool, index) => {
            const theme = themes[pool.themeId as ThemeId];
            return (
              <div
                key={index}
                className={`bg-slate-800/50 backdrop-blur-xl rounded-xl border ${theme.border} p-3 hover:bg-slate-800/70 transition-all`}
              >
                {/* Header with tokens and chain */}
                <div className="flex items-start gap-2 mb-2">
                  <div className="relative w-10 h-10 shrink-0">
                    <img src={pool.tokenALogo || '/default2.png'} alt="token1" className="w-8 h-8 rounded-full border-2 border-[#1a1b2e] bg-white z-0 absolute top-0 left-0" />
                    <img src={pool.tokenBLogo || '/default2.png'} alt="token2" className="w-6 h-6 rounded-full border-2 border-[#1a1b2e] bg-white z-10 absolute bottom-0 right-0" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="inline-block text-[9px] px-1.5 py-0.5 rounded bg-slate-700/40 text-slate-300 mb-1">
                      {pool.chain}
                    </div>
                    <div className="font-semibold text-white text-xs leading-tight line-clamp-2">
                      {pool.name}
                    </div>
                  </div>
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-2 mb-2 text-[10px]">
                  <div>
                    <div className="text-slate-400">Fee Tier</div>
                    <div className="text-white font-medium">{pool.feeList?.[0] || '-'}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Total Staked</div>
                    <div className="text-white font-medium">{pool.totalStaked}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Pending</div>
                    <div className="text-white font-medium">{Number(pool.pending).toFixed(4)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Your Stake</div>
                    <div className="text-white font-medium">{pool.staked}</div>
                  </div>
                </div>

                {/* APR highlight */}
                <div className="flex items-center justify-between mb-2 p-2 bg-slate-900/50 rounded-lg">
                  <span className="text-[10px] text-slate-400">APR</span>
                  <TooltipProvider>
                        <Tooltip delayDuration={0}>
                          <TooltipTrigger asChild>
                             <span className={`font-bold text-base ${theme.text} cursor-help inline-block border-b border-dotted border-white/20`}>{formatPercentage(pool.apr)}</span>
                          </TooltipTrigger>
                          <TooltipContent className="bg-slate-900 border-slate-700">
                             <div className="text-xs space-y-1">
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">Total APR:</span>
                                  <span className="font-bold text-white">{formatPercentage(pool.apr)}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">Reward APR:</span>
                                  <span className="font-bold text-green-400">{formatPercentage(pool.stakingApr)}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">LP APR:</span>
                                  <span className="font-bold text-blue-400">{formatPercentage(pool.poolApr)}</span>
                                </div>
                             </div>
                          </TooltipContent>
                        </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Action button */}
                <Button 
                  variant="ghost" 
                  className="w-full cursor-pointer py-2 text-xs" 
                  onClick={() => {
                    setSelectedProgramAddr(pool.poolAddress as `0x${string}`);
                    setSelectedIncentive({
                      rewardToken: pool.rewardToken as `0x${string}`,
                      pool: pool.poolAddress as `0x${string}`,
                      startTime: pool.startTime!,
                      endTime: pool.endTime!,
                      refundee: pool.refundee as `0x${string}`
                    });
                    setOpenStake(true);
                  }}
                >
                  Go Farm
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    :
      <div>
        {/* --- Desktop View (Liquidity) --- */}
        <div className="hidden lg:block">
          {view === 'table' ? (
            <div className="backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden">
              <div className="grid [grid-template-columns:1.5fr_1fr_1fr_1fr_1fr_auto] gap-4 p-6 border-b border-slate-700/50">
                <button onClick={() => handleSort('name')} className="flex items-center gap-2 text-left font-medium text-slate-300 hover:text-white transition-colors">
                  Pool <SortIcon field="name" />
                </button>
                <button onClick={() => handleSort('liquidity')} className="flex items-center gap-2 text-left font-medium text-slate-300 hover:text-white transition-colors">
                  Liquidity <SortIcon field="liquidity" />
                </button>
                <button onClick={() => handleSort('volume24h')} className="flex items-center gap-2 text-left font-medium text-slate-300 hover:text-white transition-colors">
                  Vol 24H <SortIcon field="volume24h" />
                </button>
                <button onClick={() => handleSort('fee24h')} className="flex items-center gap-2 text-left font-medium text-slate-300 hover:text-white transition-colors">
                  Fee 24H <SortIcon field="fee24h" />
                </button>
                <button onClick={() => handleSort('apr')} className="flex items-center gap-2 text-left font-medium text-slate-300 hover:text-white transition-colors">
                  APR 24H <SortIcon field="apr" />
                </button>
                <div className="font-medium text-slate-300">Action</div>
              </div>
              <div className="divide-y divide-slate-700/30">
                {paginatedPools.map((pool) => {
                  const theme = themes[pool.themeId as ThemeId];
                  return (
                    <div
                      key={`${pool.tokenA}-${pool.tokenB}-${pool.fee}-${pool.poolAddress}`}
                      className="grid [grid-template-columns:1.5fr_1fr_1fr_1fr_1fr_auto] gap-4 p-6 hover:bg-slate-800/30 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative w-10 h-10">
                          <img src={pool.tokenALogo || '/default2.png'} alt="token1" className="w-8 h-8 rounded-full border-2 border-[#1a1b2e] bg-white z-0 absolute top-0 left-0" />
                          <img src={pool.tokenBLogo || '/default2.png'} alt="token2" className="w-6 h-6 rounded-full border-2 border-[#1a1b2e] bg-white z-10 absolute bottom-0 right-0" />
                        </div>
                        <div>
                          <div className={`font-semibold text-white group-hover:${theme.text} transition-colors`}>
                            {pool.tokenA} / {pool.tokenB}
                          </div>
                          <div className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-gradient-to-r ${theme.secondary} bg-opacity-30 ${theme.text} shadow-sm`}>
                            <span>{(pool.fee / 10000)}% Fee</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col justify-center">
                        <span className="text-white font-medium">{formatNumber(pool.liquidity)}</span>
                      </div>
                      <div className="flex flex-col justify-center">
                        <span className="text-white font-medium">{formatNumber(pool.volume24h)}</span>
                      </div>
                      <div className="flex flex-col justify-center">
                        <span className="text-white font-medium">{formatNumber(pool.fee24h)}</span>
                      </div>
                      <div className="flex flex-col justify-center">
                        <TooltipProvider>
                        <Tooltip delayDuration={0}>
                          <TooltipTrigger asChild>
                            <span className={`font-bold text-lg ${theme.text} cursor-help inline-block border-b border-dotted border-white/20`}>{formatPercentage(pool.apr)}</span>
                          </TooltipTrigger>
                          <TooltipContent className="bg-slate-900 border-slate-700">
                             <div className="text-xs space-y-1">
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">Total APR:</span>
                                  <span className="font-bold text-white">{formatPercentage(pool.apr)}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">Reward APR:</span>
                                  <span className="font-bold text-green-400">{formatPercentage(pool.stakingApr)}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">LP APR:</span>
                                  <span className="font-bold text-blue-400">{formatPercentage(pool.poolApr)}</span>
                                </div>
                             </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      </div>
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <Button variant="ghost" className="cursor-pointer px-2 py-1 text-xs" onClick={() => handleClick(`/swap?input=${pool.tokenAaddr}&output=${pool.tokenBaddr}&tab=liquidity`)}>
                          Supply
                        </Button>
                        <Button variant="ghost" className="cursor-pointer px-2 py-1 text-xs" onClick={() => handleClick(`/swap?input=${pool.tokenAaddr}&output=${pool.tokenBaddr}&tab=swap`)}>
                          Swap
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {totalPoolPages > 1 && (
                <div className="flex justify-between items-center px-6 py-4 border-t border-slate-700/50">
                    <Button 
                        variant="ghost" 
                        disabled={currentPage === 1}
                        onClick={() => router.push(`${pathname}?page=${currentPage - 1}`)}
                    >
                        Previous
                    </Button>
                    <span className="text-slate-400 text-sm">
                        Page {currentPage} of {totalPoolPages}
                    </span>
                    <Button 
                        variant="ghost" 
                        disabled={currentPage === totalPoolPages}
                        onClick={() => router.push(`${pathname}?page=${currentPage + 1}`)}
                    >
                        Next
                    </Button>
                </div>
              )}
            </div>
          ) : (
             <div><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedPools.map((pool) => {
                const theme = themes[pool.themeId as ThemeId];
                return (
                  <div
                    key={`${pool.tokenA}-${pool.tokenB}-${pool.fee}-${pool.poolAddress}`}
                    className={`bg-slate-800/50 backdrop-blur-xl rounded-xl border ${theme.border} p-6 hover:bg-slate-800/70 transition-all cursor-pointer group relative overflow-hidden`}
                  >
                    <div className={`absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity`}>
                       {/* Background decoration if needed */}
                    </div>
                    
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="relative w-12 h-12">
                          <img src={pool.tokenALogo || '/default2.png'} alt="token1" className="w-10 h-10 rounded-full border-2 border-[#1a1b2e] bg-white z-0 absolute top-0 left-0" />
                          <img src={pool.tokenBLogo || '/default2.png'} alt="token2" className="w-8 h-8 rounded-full border-2 border-[#1a1b2e] bg-white z-10 absolute bottom-0 right-0" />
                        </div>
                        <div>
                          <div className={`font-bold text-lg text-white group-hover:${theme.text} transition-colors`}>
                            {pool.tokenA} / {pool.tokenB}
                          </div>
                          <div className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300`}>
                            <span>{(pool.fee / 10000)}% Fee</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <div className="text-xs text-slate-400 mb-1">Liquidity</div>
                        <div className="text-white font-medium">{formatNumber(pool.liquidity)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 mb-1">Volume 24H</div>
                        <div className="text-white font-medium">{formatNumber(pool.volume24h)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 mb-1">Fees 24H</div>
                        <div className="text-white font-medium">{formatNumber(pool.fee24h)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 mb-1">APR</div>
                        <TooltipProvider>
                                    <Tooltip delayDuration={0}>
                                        <TooltipTrigger asChild>
                                           <div className={`font-bold ${theme.text} cursor-help inline-block border-b border-dotted border-white/20`}>{formatPercentage(pool.apr)}</div>
                                        </TooltipTrigger>
                                        <TooltipContent className="bg-slate-900 border-slate-700">
                                            <div className="text-xs space-y-1">
                                                <div className="flex justify-between gap-4">
                                                <span className="text-slate-400">Total APR:</span>
                                                <span className="font-bold text-white">{formatPercentage(pool.apr)}</span>
                                                </div>
                                                <div className="flex justify-between gap-4">
                                                <span className="text-slate-400">Reward APR:</span>
                                                <span className="font-bold text-green-400">{formatPercentage(pool.stakingApr)}</span>
                                                </div>
                                                <div className="flex justify-between gap-4">
                                                <span className="text-slate-400">LP APR:</span>
                                                <span className="font-bold text-blue-400">{formatPercentage(pool.poolApr)}</span>
                                                </div>
                                            </div>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-auto pt-4 border-t border-slate-700/30">
                      <Button variant="secondary" className="flex-1 h-8 text-xs" onClick={() => handleClick(`/swap?input=${pool.tokenAaddr}&output=${pool.tokenBaddr}&tab=liquidity`)}>
                        Supply
                      </Button>
                      <Button variant="outline" className="flex-1 h-8 text-xs bg-transparent border-slate-600 hover:bg-slate-700" onClick={() => handleClick(`/swap?input=${pool.tokenAaddr}&output=${pool.tokenBaddr}&tab=swap`)}>
                        Swap
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
              {totalPoolPages > 1 && (
                <div className="flex justify-between items-center px-6 py-4 border-t border-slate-700/50">
                    <Button 
                        variant="ghost" 
                        disabled={currentPage === 1}
                        onClick={() => router.push(`${pathname}?page=${currentPage - 1}`)}
                    >
                        Previous
                    </Button>
                    <span className="text-slate-400 text-sm">
                        Page {currentPage} of {totalPoolPages}
                    </span>
                    <Button 
                        variant="ghost" 
                        disabled={currentPage === totalPoolPages}
                        onClick={() => router.push(`${pathname}?page=${currentPage + 1}`)}
                    >
                        Next
                    </Button>
                </div>
              )}
          </div>)}
        </div>

        {/* --- Mobile View (Liquidity) --- */}
        <div className="lg:hidden space-y-3">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-white">Liquidity Pools</h2>
          </div>
          {paginatedPools.map((pool) => {
            const theme = themes[pool.themeId as ThemeId];
            return (
              <div
                key={`${pool.tokenA}-${pool.tokenB}-${pool.fee}-${pool.poolAddress}`}
                className={`bg-slate-800/50 backdrop-blur-xl rounded-xl border ${theme.border} p-3 hover:bg-slate-800/70 transition-all`}
              >
                {/* Header with tokens */}
                <div className="flex items-start gap-2 mb-2">
                  <div className="relative w-10 h-10 shrink-0">
                    <img src={pool.tokenALogo || 'https://cmswap.mypinata.cloud/ipfs/bafkreiexe7q5ptjflrlccf3vtqdbpwk36j3emlsulksx7ot52e3uqyqu3u'} alt="token1" className="w-8 h-8 rounded-full border-2 border-[#1a1b2e] bg-white z-0 absolute top-0 left-0" />
                    <img src={pool.tokenBLogo || 'https://cmswap.mypinata.cloud/ipfs/bafkreiexe7q5ptjflrlccf3vtqdbpwk36j3emlsulksx7ot52e3uqyqu3u'} alt="token2" className="w-6 h-6 rounded-full border-2 border-[#1a1b2e] bg-white z-10 absolute bottom-0 right-0" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-white text-xs leading-tight">
                      {pool.tokenA} / {pool.tokenB}
                    </div>
                    <div className="inline-block text-[9px] px-1.5 py-0.5 rounded bg-slate-700/40 text-slate-300 mt-1">
                      {(pool.fee / 10000)}% Fee
                    </div>
                  </div>
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-2 mb-2 text-[10px]">
                  <div>
                    <div className="text-slate-400">TVL</div>
                    <div className="text-white font-medium">{formatNumber(pool.liquidity)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Volume 24H</div>
                    <div className="text-white font-medium">{formatNumber(pool.volume24h)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Fees 24H</div>
                    <div className="text-white font-medium">{formatNumber(pool.fee24h)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">APR</div>
                    <TooltipProvider>
                        <Tooltip delayDuration={0}>
                          <TooltipTrigger asChild>
                             <div className={`font-bold text-sm ${theme.text} cursor-help border-b border-dotted border-white/20 inline-block`}>{formatPercentage(pool.apr)}</div>
                          </TooltipTrigger>
                          <TooltipContent className="bg-slate-900 border-slate-700">
                             <div className="text-xs space-y-1">
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">Total APR:</span>
                                  <span className="font-bold text-white">{formatPercentage(pool.apr)}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">Reward APR:</span>
                                  <span className="font-bold text-green-400">{formatPercentage(pool.stakingApr)}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">LP APR:</span>
                                  <span className="font-bold text-blue-400">{formatPercentage(pool.poolApr)}</span>
                                </div>
                             </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 pt-2 border-t border-slate-700/30">
                  <Button variant="ghost" className="flex-1 py-2 text-xs" onClick={() => handleClick(`/swap?input=${pool.tokenAaddr}&output=${pool.tokenBaddr}&tab=liquidity`)}>
                    Supply
                  </Button>
                  <Button variant="ghost" className="flex-1 py-2 text-xs" onClick={() => handleClick(`/swap?input=${pool.tokenAaddr}&output=${pool.tokenBaddr}&tab=swap`)}>
                    Swap
                  </Button>
                </div>
              </div>
            );
          })}
                 {/* Mobile Pagination */}
                 {totalPoolPages > 1 && (
                    <div className="flex justify-between items-center px-4 py-4 border-t border-slate-700/50">
                        <Button 
                            variant="ghost" 
                            size="sm"
                            disabled={currentPage === 1}
                            onClick={() => router.push(`${pathname}?page=${currentPage - 1}`)}
                        >
                            Previous
                        </Button>
                        <span className="text-slate-400 text-xs">
                            Page {currentPage} of {totalPoolPages}
                        </span>
                        <Button 
                            variant="ghost" 
                            size="sm"
                            disabled={currentPage === totalPoolPages}
                            onClick={() => router.push(`${pathname}?page=${currentPage + 1}`)}
                        >
                            Next
                        </Button>
                    </div>
                )}
        </div>
      </div>
    }
      </div>
    </div>

    <StakingV3Modal 
      open={openStake} 
      onOpenChange={setOpenStake} 
      poolAddress={selectedProgramAddr ?? undefined}
      incentiveKey={selectedIncentive ?? undefined}
    />
    </>
  );
}
