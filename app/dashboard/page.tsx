'use client';

import { useState, useEffect } from 'react';
import { createPublicClient, http, formatEther, parseAbiItem } from 'viem';
import { bitkubTestnet } from 'viem/chains';
import { chains } from '@/lib/chains';
import { Loader2, RefreshCw, Activity, ArrowRightLeft, Layers } from 'lucide-react';
import { format } from 'date-fns';

// ABI for the Swap event based on your indexer
// event Swap(address indexed sender, bool indexed isBuy, uint256 amountIn, uint256 amountOut, uint256 reserveIn, uint256 reserveOut)
const SWAP_EVENT_ABI = parseAbiItem(
  'event Swap(address indexed sender, bool indexed isBuy, uint256 amountIn, uint256 amountOut, uint256 reserveIn, uint256 reserveOut)'
);

// Configuration for chains (using the address from your indexer for 25925 as default)
// For other chains, we'd need the specific contract address. 
// I'm assuming 25925 is the primary one for now given the context.
const WATCH_LIST = [
  { 
    id: 25925, 
    name: 'Bitkub Testnet', 
    // Address from your standalone-indexer.mjs default
    address: '0x46a4073c830031ea19d7b9825080c05f8454e530' as `0x${string}`, 
    chain: bitkubTestnet 
  }
];

type TxLog = {
    hash: string;
    blockNumber: bigint;
    isBuy: boolean;
    amountIn: string;
    amountOut: string;
    sender: string;
    timestamp?: number;
};

type ChainStats = {
    chainId: number;
    volume24h: number; // In native unit for simplicity
    txCount: number;
    lastBlock: number;
};

// Bitkub Chain averages ~5s per block. 24h = 86400s. 86400 / 5 = 17280 blocks.
// We'll use 18000 to be safe.
const BLOCKS_IN_24H = BigInt(18000);

export default function DashboardPage() {
    const [logs, setLogs] = useState<TxLog[]>([]);
    const [stats, setStats] = useState<Record<number, ChainStats>>({});
    const [loading, setLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState(new Date());

    const fetchData = async () => {
        setLoading(true);
        const allLogs: TxLog[] = [];
        const newStats: Record<number, ChainStats> = {};

        try {
            for (const item of WATCH_LIST) {
                const client = createPublicClient({
                    chain: item.chain,
                    transport: http()
                });

                const blockNumber = await client.getBlockNumber();
                const fromBlock = blockNumber - BLOCKS_IN_24H; 
                // Note: Some RPCs limit range. If this fails, we might need to chunk or just use what we can.
                // Bitkub Testnet RPC is usually permissive enough for events.

                const events = await client.getLogs({
                    address: item.address,
                    event: SWAP_EVENT_ABI,
                    fromBlock: fromBlock > BigInt(0) ? fromBlock : BigInt(0),
                    toBlock: 'latest'
                });

                // Calculate stats
                let vol = 0;
                
                // Process events (Reverse to get latest first)
                const processed = events.reverse().map(e => {
                    const isBuy = e.args.isBuy || false;
                    const amountIn = formatEther(e.args.amountIn || BigInt(0));
                    const amountOut = formatEther(e.args.amountOut || BigInt(0));
                    
                    // Rough volume estimation
                    vol += Number(isBuy ? amountOut : amountIn); 

                    return {
                        hash: e.transactionHash || '',
                        blockNumber: e.blockNumber || BigInt(0),
                        isBuy,
                        amountIn,
                        amountOut,
                        sender: e.args.sender || '',
                    };
                });

                allLogs.push(...processed);

                newStats[item.id] = {
                    chainId: item.id,
                    volume24h: vol,
                    txCount: processed.length,
                    lastBlock: Number(blockNumber)
                };
            }

            // Sort all logs by block number descending
            setLogs(allLogs.sort((a, b) => Number(b.blockNumber - a.blockNumber)));
            setStats(newStats);
        } catch (error) {
            console.error("Failed to fetch chain data", error);
        } finally {
            setLoading(false);
            setLastRefresh(new Date());
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60000); // Poll every 60s for 24h data is plenty
        return () => clearInterval(interval);
    }, []);

    // Aggregates
    const totalTx = Object.values(stats).reduce((acc, curr) => acc + curr.txCount, 0);
    const totalVolume = Object.values(stats).reduce((acc, curr) => acc + curr.volume24h, 0);

    return (
        <main className="min-h-screen w-full bg-black text-white p-6 md:p-12 font-sans selection:bg-cyan-500/30">
            <div className="max-w-7xl mx-auto space-y-12">
                
                {/* Header */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/10 pb-8">
                    <div>
                        <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-white mb-2">
                             24H <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">DASHBOARD</span>
                        </h1>
                        <p className="text-zinc-400 text-lg font-light flex items-center gap-2">
                            <Activity className="w-4 h-4 text-green-500" />
                            Live On-chain Metrics (~18k Blocks)
                        </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <button 
                            onClick={fetchData}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm font-medium transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            {loading ? 'Syncing...' : 'Refresh'}
                        </button>
                        <span className="text-xs text-zinc-500">
                            Last synced: {format(lastRefresh, 'HH:mm:ss')}
                        </span>
                    </div>
                </header>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-6 rounded-3xl bg-zinc-900/30 border border-white/5 backdrop-blur-sm hover:border-cyan-500/30 transition-colors group">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 rounded-2xl bg-cyan-500/10 text-cyan-400 group-hover:scale-110 transition-transform">
                                <Activity className="w-6 h-6" />
                            </div>
                            <h3 className="text-zinc-400 font-medium uppercase tracking-wider text-sm">24H Transactions</h3>
                        </div>
                        <div className="text-4xl font-bold text-white tracking-tight">
                            {totalTx}
                        </div>
                        <p className="text-xs text-zinc-500 mt-2">Total across monitored chains</p>
                    </div>

                    <div className="p-6 rounded-3xl bg-zinc-900/30 border border-white/5 backdrop-blur-sm hover:border-purple-500/30 transition-colors group">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-400 group-hover:scale-110 transition-transform">
                                <Layers className="w-6 h-6" />
                            </div>
                            <h3 className="text-zinc-400 font-medium uppercase tracking-wider text-sm">24H Volume</h3>
                        </div>
                        <div className="text-4xl font-bold text-white tracking-tight">
                            {totalVolume.toFixed(2)}
                        </div>
                        <p className="text-xs text-zinc-500 mt-2">Native Units Estimates</p>
                    </div>

                    <div className="p-6 rounded-3xl bg-zinc-900/30 border border-white/5 backdrop-blur-sm hover:border-green-500/30 transition-colors group">
                         <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 rounded-2xl bg-green-500/10 text-green-400 group-hover:scale-110 transition-transform">
                                <ArrowRightLeft className="w-6 h-6" />
                            </div>
                            <h3 className="text-zinc-400 font-medium uppercase tracking-wider text-sm">Latest Block</h3>
                        </div>
                         <div className="text-4xl font-bold text-white tracking-tight">
                             {stats[25925]?.lastBlock || '-'}
                        </div>
                         <p className="text-xs text-zinc-500 mt-2">Bitkub Testnet Head</p>
                    </div>
                </div>

                {/* Main Content: Logs */}
                <div className="rounded-3xl border border-white/10 bg-black/40 backdrop-blur-md overflow-hidden min-h-[500px]">
                    <div className="p-6 border-b border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                            <span className="w-2 h-8 bg-cyan-500 rounded-full inline-block mr-2" />
                            Activity Feed (24H)
                        </h2>
                        
                        <div className="flex gap-2">
                            {Object.entries(stats).map(([id, s]) => (
                                <div key={id} className="px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs text-zinc-300">
                                    Chain {id}: {s.txCount} txs
                                </div>
                            ))}
                        </div>
                    </div>

                    {loading && logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4 text-zinc-500">
                            <Loader2 className="w-8 h-8 animate-spin" />
                            <p>Syncing last 24 hours of data...</p>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4 text-zinc-500">
                             <Activity className="w-12 h-12 opacity-20" />
                            <p>No transactions found in the last 24 hours.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/5">
                            {logs.map((log) => (
                                <div key={log.hash} className="p-4 md:p-6 hover:bg-white/[0.02] transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-4 group">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${log.isBuy ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
                                            <ArrowRightLeft className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-sm font-bold ${log.isBuy ? 'text-green-400' : 'text-red-400'}`}>
                                                    {log.isBuy ? 'BUY' : 'SELL'}
                                                </span>
                                                <span className="text-zinc-600 text-xs">•</span>
                                                <span className="text-sm font-medium text-white">
                                                    {Number(log.isBuy ? log.amountOut : log.amountIn).toFixed(4)} Tokens
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-xs text-zinc-500 font-mono bg-zinc-900 px-2 py-0.5 rounded">
                                                    Blk #{log.blockNumber.toString()}
                                                </span>
                                                <a 
                                                    href={`https://testnet.bkcscan.com/tx/${log.hash}`} 
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-cyan-500/70 hover:text-cyan-400 hover:underline truncate max-w-[100px] md:max-w-[200px]"
                                                >
                                                    {log.hash}
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex flex-col md:items-end gap-1 pl-14 md:pl-0 w-full md:w-auto">
                                        <div className="text-xs text-zinc-500 uppercase tracking-wider">Estimated Value</div>
                                        <div className="text-lg font-mono text-zinc-300">
                                            {Number(log.isBuy ? log.amountIn : log.amountOut).toFixed(6)}
                                        </div>
                                        <div className="text-xs text-zinc-600 truncate max-w-[150px]">
                                            From: {log.sender.slice(0, 6)}...{log.sender.slice(-4)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
