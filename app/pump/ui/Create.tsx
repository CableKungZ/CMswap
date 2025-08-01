'use client';
import Link from "next/link";
import { useState } from 'react';
import { useConnections, useAccount } from 'wagmi';
import { formatEther, parseEther, erc20Abi } from 'viem';
import { writeContract, readContracts } from '@wagmi/core';
import { config } from '@/app/config';
import { ERC20FactoryABI } from '@/app/pump/abi/ERC20Factory';
import { ERC20FactoryV2ABI } from '@/app/pump/abi/ERC20FactoryV2';
import { redirect } from 'next/navigation';

export default function Create({
  mode, chain, token,
}: {
  mode: string;
  chain: string;
  token: string;
}) {
  const connections = useConnections();

  let _chainId = 0;
  if (chain === 'kub' || chain === '') {
    _chainId = 96;
  } else if (chain === 'monad') {
    _chainId = 10143;
  } else if (chain === 'kubtestnet'){
    _chainId = 25925;
  }
  // add chain here
  let currencyAddr: string = '';
  let bkgafactoryAddr: string = '';
  if ((chain === 'kub' || chain === '') && (mode === 'lite' || mode === '') && (token === 'cmm' || token === '')) {
    currencyAddr = '0x9b005000a10ac871947d99001345b01c1cef2790';
    bkgafactoryAddr = '0x10d7c3bDc6652bc3Dd66A33b9DD8701944248c62';
  } else if ((chain === 'kub' || chain === '') && mode === 'pro') {
    currencyAddr = '0x67ebd850304c70d983b2d1b93ea79c7cd6c3f6b5';
    bkgafactoryAddr = '0x7bdceEAf4F62ec61e2c53564C2DbD83DB2015a56';
  } else if (chain === 'monad' && mode === 'pro') {
    currencyAddr = '0x760afe86e5de5fa0ee542fc7b7b713e1c5425701';
    bkgafactoryAddr = '0x6dfc8eecca228c45cc55214edc759d39e5b39c93';
  } else if (chain === 'kubtestnet' && mode === 'pro') {
        currencyAddr = '0x700D3ba307E1256e509eD3E45D6f9dff441d6907';
        bkgafactoryAddr = '0x46a4073c830031ea19d7b9825080c05f8454e530';
    }  
  // add chain and mode here
  const dataofcurr = {addr: currencyAddr};
  const bkgafactoryContract = {
    address: bkgafactoryAddr as '0xstring',
    abi: chain === 'kubtestnet' ? ERC20FactoryV2ABI : ERC20FactoryABI,
    chainId: _chainId,
  } as const

  const account = useAccount();
  const [file, setFile] = useState(null as unknown as File);
  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [desp, setDesp] = useState('');

  const _launch = async () => {
    try {
      alert('Your token is launching, pls wait a sec...')
      const data = new FormData();
      data.set("file", file);
      const uploadRequest = await fetch("/pump/api/files", { method: "POST", body: data, });
      const upload = await uploadRequest.json();
      console.log(name, ticker, desp, 'ipfs://' + upload.IpfsHash);
      let result = '';
      if (mode === 'lite' && (token === 'cmm' || token === '')) {
        const allowance = await readContracts(config, {
          contracts: [
            {
                address: dataofcurr.addr as '0xstring',
                abi: erc20Abi,
                functionName: 'allowance',
                args: [account.address as '0xstring', bkgafactoryAddr as '0xstring'],
                chainId: _chainId,
            },
          ],
        });
        if (Number(formatEther(allowance[0].result!)) < 6000) {
            writeContract(config, {
                address: dataofcurr.addr as '0xstring',
                abi: erc20Abi,
                functionName: 'approve',
                args: [bkgafactoryAddr as '0xstring', parseEther('10000')],
                chainId: _chainId,
            })
        }
        result = await writeContract(config, {
          ...bkgafactoryContract,
          functionName: 'createToken',
          args: [name, ticker, 'ipfs://' + upload.IpfsHash, desp],
          value: parseEther('0'),
        });
      } else if (chain === 'kubtestnet' && mode === 'pro') {
        // note ipfs://bafkreiexe7q5ptjflrlccf3vtqdbpwk36j3emlsulksx7ot52e3uqyqu3u is fallback logo
              result = await writeContract(config, {
          ...bkgafactoryContract,
          functionName: 'createToken',
          args: [name, ticker, 'ipfs://' + upload.IpfsHash, desp,'ipfs://bafkreiexe7q5ptjflrlccf3vtqdbpwk36j3emlsulksx7ot52e3uqyqu3u','l2','l3'],
          value: parseEther('0'),
        });
        
      }
        else{
        result = await writeContract(config, {
          ...bkgafactoryContract,
          functionName: 'createToken',
          args: [name, ticker, 'ipfs://' + upload.IpfsHash, desp],
          value: parseEther('1'),
        });
      }

/*       alert("Launch success!, your txn hash: " + 
        (chain === 'kub' && "https://www.kubscan.com/tx/") + 
        (chain === 'monad' && "https://monad-testnet.socialscan.io/") +
        (chain === 'kubtestnet' && "https://testnet.kubscan.com/tx/") 
        + result); */
    redirect(`/pump/launchpad?chain=${chain}&mode=${mode}`);

    } catch (e) {
      console.log(e);
      alert("Launch failed");
    }
  }
  const launch = () => {
    _launch();
    setName('');
    setTicker('');
    setDesp('');
  };

  return (
    <main className="mt-[70px] md:mt-[50px] row-start-2 w-full xl:w-1/4 self-center h-full flex flex-col gap-6 items-center xl:items-start mt-[100px] md:mt-1">
        <Link href={"/pump/launchpad?chain=" + chain + (mode === 'pro' ? "&mode=pro" : "&mode=lite")} prefetch={false} className="underline hover:font-bold">Back to launchpad</Link>
        <span className="text-2xl font-bold mt-4">Create a meme 🚀</span>
        <form action={launch} className="flex flex-col gap-6">
          <input className="w-full p-4 bg-gray-700 rounded-xl leading-tight focus:outline-none" placeholder="Coin Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input className="w-full p-4 bg-gray-700 rounded-xl leading-tight focus:outline-none" placeholder="Ticker" value={ticker} onChange={(e) => setTicker(e.target.value)} required />
          <div className="w-full">
            <input
              className="w-full p-4 bg-gray-700 rounded-xl leading-tight focus:outline-none"
              placeholder="Description"
              value={desp}
              onChange={(e) => setDesp(e.target.value)}
              maxLength={200}
            />
            <div className="text-right text-sm text-gray-400 mt-1">
              {desp.length}/200
            </div>
          </div>
          <div className="w-full pt-1 flex flex-col gap-4" >
            <input type="file" className="file:mr-4 file:rounded-full file:border-0 file:bg-gray-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-violet-700 hover:file:bg-violet-100 dark:file:bg-violet-600 dark:file:text-violet-100 dark:hover:file:bg-violet-500 ..." onChange={(e) => setFile(e.target.files![0])} required />
          </div>
          <div className="text-teal-900 pt-2 w-full" role="alert">
            <div className="flex">
              <svg className="fill-current h-4 w-4 text-teal-500 mr-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M2.93 17.07A10 10 0 1 1 17.07 2.93 10 10 0 0 1 2.93 17.07zm12.73-1.41A8 8 0 1 0 4.34 4.34a8 8 0 0 0 11.32 11.32zM9 11V9h2v6H9v-4zm0-6h2v2H9V5z"/></svg>
              <p className="font-bold text-xs">Deployment cost: 
                {chain === 'kub' && mode === 'pro' && '1 KUB (not included network fee)'}
                {chain === 'kub' && mode === 'lite' && (token === 'cmm' || token === '') && '6,000 CMM (not included network fee)'}
                {chain === 'monad' && mode === 'pro' && '1 MON (not included network fee)'}
                {chain === 'kubtestnet' && mode === 'pro' && ' 0 tKUB only network fee'}
              </p>
            </div>
          </div>
          {connections && account.address !== undefined && account.chainId === _chainId ? 
            <button className="w-1/2 p-2 mb-3 rounded-2xl font-bold bg-emerald-300 text-slate-900 underline hover:bg-sky-500 hover:text-white cursor-pointer" type="submit"><span className="self-center">Launch!</span></button> :
            <button className="w-1/2 p-2 mb-3 rounded-2xl font-bold bg-gray-500 cursor-not-allowed"><span className="self-center">Launch!</span></button>
          }
        </form>
    </main>
  );
}
