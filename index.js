require('dotenv').config();
const axios = require('axios');
const ethers = require('ethers');
const readline = require('readline');
const figlet = require('figlet');
const fs = require('fs');
const { HttpsProxyAgent } = require('https-proxy-agent');

// Simplified color system
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  blue: '\x1b[34m'
};

// Simplified logger
const logger = {
  info: (msg) => console.log(`${colors.green}[i] ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}[!] ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}[✗] ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}[✓] ${msg}${colors.reset}`),
  step: (msg) => console.log(`${colors.white}[>] ${msg}${colors.reset}`),
  loading: (msg) => console.log(`${colors.blue}[⟳] ${msg}${colors.reset}`),
  banner: () => {
    console.log(figlet.textSync('EUCLID BOT', { font: 'Standard' }));
    console.log('  Mrf\n');
  }
};

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper functions
const question = (query) => new Promise(resolve => rl.question(query, resolve));
const randomDelay = (min = 2000, max = 5000) => 
  new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));

// Load proxies from file
const loadProxies = () => {
  try {
    const proxyData = fs.readFileSync('proxy.txt', 'utf8');
    const proxies = proxyData.split('\n').filter(line => line.trim() !== '');
    return proxies;
  } catch (error) {
    logger.warn(`Failed to load proxies: ${error.message}`);
    return [];
  }
};

// Get random proxy from list
const getRandomProxy = (proxies) => {
  if (!proxies || proxies.length === 0) return null;
  return proxies[Math.floor(Math.random() * proxies.length)];
};

// Format proxy for axios
const formatProxy = (proxyString) => {
  // Format: username:password@ip:port
  if (!proxyString) return null;
  
  const [auth, host] = proxyString.split('@');
  if (!auth || !host) return null;
  
  const [username, password] = auth.split(':');
  const [ip, port] = host.split(':');
  
  return {
    protocol: 'http',
    host: ip,
    port: parseInt(port),
    auth: {
      username,
      password
    }
  };
};

// Retry function with exponential backoff
const retry = async (fn, retries = 20, baseDelay = 5000, proxies = null) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      
      const isRateLimit = error.response?.status === 429;
      const delay = isRateLimit 
        ? baseDelay * Math.pow(2, Math.min(i, 5)) + Math.random() * 1000
        : baseDelay + Math.random() * 2000;
      
      // If using proxies and hit rate limit, switch proxy
      let proxyMessage = '';
      if (isRateLimit && proxies && proxies.length > 0) {
        proxyMessage = ' Switching proxy...';
      }
        
      logger.warn(`${isRateLimit ? 'Rate limit hit' : 'API call failed'}: ${error.message}. Retry ${i + 1}/${retries} in ${Math.round(delay/1000)}s...${proxyMessage}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Create axios instance with proper headers and optional proxy
const createAxiosInstance = (proxy = null) => {
  const config = {
    timeout: 30000,
    headers: {
      'accept': 'application/json, text/plain, */*',
      'content-type': 'application/json',
      'accept-language': 'en-US,en;q=0.5',
      'priority': 'u=1, i',
      'sec-ch-ua': '"Chromium";v="136", "Brave";v="136", "Not.A/Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'cross-site',
      'sec-gpc': '1',
      'Referer': 'https://testnet.euclidswap.io/',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    }
  };

  // Add proxy if provided
  if (proxy) {
    const formattedProxy = formatProxy(proxy);
    if (formattedProxy) {
      const proxyUrl = `http://${formattedProxy.auth.username}:${formattedProxy.auth.password}@${formattedProxy.host}:${formattedProxy.port}`;
      config.httpsAgent = new HttpsProxyAgent(proxyUrl);
      config.proxy = false; // Disable axios's default proxy handling
    }
  }

  return axios.create(config);
};

// Token configurations
const TOKEN_CONFIGS = {
  euclid: {
    chainUid: 'monad',
    swapRoute: ['eth', 'usdc', 'usdt', 'andr', 'euclid'],
    defaultAmountOut: '338713',
    amountOutHops: [
      'usdc: {VALUE}', 'usdt: {VALUE}', 'andr: {VALUE}', 'euclid: {VALUE}'
    ],
    priceImpact: '29.58'
  },
  andr: {
    chainUid: 'andromeda',
    swapRoute: ['eth', 'euclid', 'usdc', 'usdt', 'andr'],
    defaultAmountOut: '1000',
    amountOutHops: [
      'euclid: {VALUE}', 'usdc: {VALUE}', 'usdt: {VALUE}', 'andr: {VALUE}'
    ],
    priceImpact: '29.58'
  },
  mon: {
    chainUid: 'monad',
    swapRoute: ['eth', 'sp500', 'usdt', 'euclid', 'mon'],
    defaultAmountOut: '7836729415067468',
    amountOutHops: [
      'sp500: {VALUE}', 'usdt: {VALUE}', 'euclid: {VALUE}', 'mon: {VALUE}'
    ],
    priceImpact: '34.80'
  }
};

// Check ethers version
const isEthersV6 = parseInt(ethers.version.split('.')[0], 10) >= 6;

// Main function
async function main() {
  logger.banner();

  try {
    // Load proxies
    const proxies = loadProxies();
    const useProxies = proxies.length > 0;
    
    if (useProxies) {
      logger.info(`Loaded ${proxies.length} proxies from proxy.txt`);
    } else {
      logger.warn(`No proxies loaded from proxy.txt. Running without proxy.`);
    }

    // Menu display
    console.log(`${colors.cyan}Swap Options:${colors.reset}`);
    console.log(`1. ETH - EUCLID (Arbitrum)`);
    console.log(`2. ETH - ANDR (Arbitrum)`);
    console.log(`3. ETH - MON (Arbitrum)`);
    console.log(`4. Random Swap (EUCLID/ANDR/MON)`);
    console.log(`5. Exit\n`);

    const swapType = await question(`${colors.cyan}Enter option (1-5): ${colors.reset}`);
    
    if (swapType === '5') {
      logger.info(`Exiting...`);
      rl.close();
      return;
    }

    if (!['1', '2', '3', '4'].includes(swapType)) {
      logger.error(`Invalid option. Please enter 1-5.`);
      rl.close();
      return;
    }

    // Get transaction parameters
    const numTransactions = parseInt(await question(`${colors.cyan}Number of transactions: ${colors.reset}`));
    const ethAmount = parseFloat(await question(`${colors.cyan}ETH amount per transaction: ${colors.reset}`));

    if (isNaN(numTransactions) || isNaN(ethAmount) || numTransactions <= 0 || ethAmount <= 0) {
      logger.error(`Invalid input. Please enter positive numbers.`);
      rl.close();
      return;
    }

    // Proxy option
    let useProxy = false;
    if (useProxies) {
      const proxyOption = await question(`${colors.cyan}Use proxies? (y/n): ${colors.reset}`);
      useProxy = proxyOption.toLowerCase() === 'y';
    }

    // Get private key from .env
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      logger.error(`Private key not found in .env file`);
      rl.close();
      return;
    }

    // Setup provider and wallet
    const provider = isEthersV6 
      ? new ethers.JsonRpcProvider('https://sepolia-rollup.arbitrum.io/rpc')
      : new ethers.providers.JsonRpcProvider('https://sepolia-rollup.arbitrum.io/rpc');
    
    const wallet = isEthersV6
      ? new ethers.Wallet(privateKey, provider)
      : new ethers.Wallet(privateKey, provider);

    const walletAddress = wallet.address;
    const contractAddress = '0x7f2CC9FE79961f628Da671Ac62d1f2896638edd5';

    logger.info(`Connected to wallet: ${colors.yellow}${walletAddress}`);
    logger.info(`Network: ${colors.yellow}Arbitrum Sepolia (Chain ID: 421614)\n`);

    // Check balance
    const balance = await provider.getBalance(walletAddress);
    const ethValue = isEthersV6 
      ? ethers.parseEther(ethAmount.toString()) 
      : ethers.utils.parseEther(ethAmount.toString());
    
    const gasEstimatePerTx = isEthersV6
      ? ethers.parseEther('0.00009794')
      : ethers.utils.parseUnits('0.00009794', 'ether');
    
    const requiredEth = isEthersV6
      ? ethValue * BigInt(numTransactions)
      : ethValue.mul(numTransactions);
    
    const totalRequiredEth = isEthersV6
      ? requiredEth + gasEstimatePerTx * BigInt(numTransactions)
      : requiredEth.add(gasEstimatePerTx.mul(numTransactions));
    
    const isBalanceInsufficient = isEthersV6
      ? balance < totalRequiredEth
      : balance.lt(totalRequiredEth);

    if (isBalanceInsufficient) {
      const formattedRequired = isEthersV6
        ? ethers.formatEther(totalRequiredEth)
        : ethers.utils.formatEther(totalRequiredEth);
      
      const formattedBalance = isEthersV6
        ? ethers.formatEther(balance)
        : ethers.utils.formatEther(balance);
      
      logger.error(`Insufficient ETH balance. Required: ${formattedRequired} ETH, Available: ${formattedBalance} ETH`);
      rl.close();
      return;
    }

    // Show transaction summary
    const tokenName = swapType === '1' ? 'EUCLID' : swapType === '2' ? 'ANDR' : swapType === '3' ? 'MON' : 'Random';
    const formattedTotal = isEthersV6
      ? ethers.formatEther(totalRequiredEth)
      : ethers.utils.formatEther(totalRequiredEth);
      
    logger.warn(`Transaction Summary:`);
    logger.step(`Swap type: ${colors.yellow}${tokenName}`);
    logger.step(`Transactions: ${colors.yellow}${numTransactions}`);
    logger.step(`ETH per tx: ${colors.yellow}${ethAmount} ETH`);
    logger.step(`Total ETH: ${colors.yellow}${formattedTotal} ETH`);
    logger.step(`Using proxies: ${colors.yellow}${useProxy ? 'Yes' : 'No'}`);
    logger.step(`Retry policy: ${colors.yellow}20 attempts with 5s+ backoff\n`);

    const confirm = await question(`${colors.yellow}Continue? (y/n): ${colors.reset}`);
    if (confirm.toLowerCase() !== 'y') {
      logger.error(`Operation cancelled.`);
      rl.close();
      return;
    }

    // Execute transactions
    for (let i = 0; i < numTransactions; i++) {
      // Select proxy for this transaction
      let currentProxy = null;
      if (useProxy && proxies.length > 0) {
        currentProxy = getRandomProxy(proxies);
        logger.info(`Using proxy: ${colors.yellow}${currentProxy.split('@')[1]}`);
      }
      
      // Create API client with or without proxy
      const axiosInstance = createAxiosInstance(currentProxy);
      
      // Determine target token
      let targetToken;
      if (swapType === '4') {
        const options = ['euclid', 'andr', 'mon'];
        targetToken = options[Math.floor(Math.random() * options.length)];
      } else {
        targetToken = swapType === '1' ? 'euclid' : swapType === '2' ? 'andr' : 'mon';
      }
      
      const config = TOKEN_CONFIGS[targetToken];
      logger.loading(`Transaction ${i + 1}/${numTransactions} (ETH to ${targetToken.toUpperCase()}):`);
      
      try {
        await randomDelay(1000, 3000);
        logger.step(`Fetching swap quote...`);

        // Build quote payload
        const quotePayload = {
          amount_in: ethValue.toString(),
          asset_in: {
            token: 'eth',
            token_type: {
              __typename: 'NativeTokenType',
              native: { __typename: 'NativeToken', denom: 'eth' }
            }
          },
          slippage: '500',
          cross_chain_addresses: [
            {
              user: {
                address: walletAddress,
                chain_uid: config.chainUid
              },
              limit: {
                less_than_or_equal: config.defaultAmountOut
              }
            }
          ],
          partnerFee: {
            partner_fee_bps: 10,
            recipient: '0x8ed341da628fb9f540ab3a4ce4432ee9b4f5d658'
          },
          sender: {
            address: walletAddress,
            chain_uid: 'arbitrum'
          },
          swap_path: {
            path: [
              {
                route: config.swapRoute,
                dex: 'euclid',
                amount_in: ethValue.toString(),
                amount_out: '0',
                chain_uid: 'vsl',
                amount_out_for_hops: config.swapRoute.map(token => `${token}: 0`)
              }
            ],
            total_price_impact: config.priceImpact
          }
        };

        // Get quote with retry - pass proxies for potential rotation
        const quoteResponse = await retry(
          () => axiosInstance.post(
            'https://testnet.api.euclidprotocol.com/api/v1/execute/astro/swap',
            quotePayload
          ), 
          20, 
          5000, 
          useProxy ? proxies : null
        );

        logger.info(`Quote received`);
        await randomDelay(2000, 4000);

        // Extract amount_out from response or use default
        const amountOut = quoteResponse.data.meta
          ? JSON.parse(quoteResponse.data.meta).swaps.path[0].amount_out
          : config.defaultAmountOut;
          
        if (!amountOut || amountOut === '0') {
          logger.error(`Invalid amount_out in API response. Skipping transaction.`);
          continue;
        }

        logger.step(`Building swap transaction...`);

        // Build swap payload
        const swapPayload = {
          ...quotePayload,
          swap_path: {
            path: [
              {
                ...quotePayload.swap_path.path[0],
                amount_out: amountOut,
                amount_out_for_hops: config.amountOutHops
              }
            ],
            total_price_impact: config.priceImpact
          }
        };

        // Get swap data with retry
        const swapResponse = await retry(
          () => axiosInstance.post(
            'https://testnet.api.euclidprotocol.com/api/v1/execute/astro/swap',
            swapPayload
          ),
          20,
          5000,
          useProxy ? proxies : null
        );

        logger.info(`Swap response received`);

        // Extract transaction data
        const txData = swapResponse.data.msgs?.[0]?.data;
        if (!txData) {
          logger.error(`Calldata not found in API response. Skipping transaction.`);
          continue;
        }

        if (swapResponse.data.sender?.address.toLowerCase() !== walletAddress.toLowerCase()) {
          logger.error(`API returned incorrect sender address. Skipping transaction.`);
          continue;
        }

        // Build transaction
        logger.loading(`Executing swap transaction...`);
        const gasLimit = 1500000;
        
        const tx = {
          to: contractAddress,
          value: ethValue,
          data: txData,
          gasLimit,
          nonce: await provider.getTransactionCount(walletAddress, 'pending'),
          maxFeePerGas: isEthersV6 
            ? ethers.parseUnits('0.5', 'gwei') 
            : ethers.utils.parseUnits('0.5', 'gwei'),
          maxPriorityFeePerGas: isEthersV6 
            ? ethers.parseUnits('0.25', 'gwei') 
            : ethers.utils.parseUnits('0.25', 'gwei')
        };

        // Estimate gas (with fallback)
        try {
          const gasEstimate = await provider.estimateGas(tx);
          logger.info(`Estimated gas: ${gasEstimate.toString()}`);
          tx.gasLimit = isEthersV6
            ? (gasEstimate * 110n) / 100n
            : gasEstimate.mul(110).div(100);
        } catch (gasError) {
          logger.warn(`Gas estimation failed: ${gasError.message}. Using default: ${gasLimit}`);
        }

        // Simulate transaction before sending
        try {
          await provider.call(tx);
        } catch (simulationError) {
          logger.error(`Transaction simulation failed: ${simulationError.reason || simulationError.message}`);
          continue;
        }

        // Send transaction
        const txResponse = await wallet.sendTransaction(tx);
        logger.info(`Transaction sent! Hash: ${colors.yellow}${txResponse.hash}`);

        // Wait for confirmation
        logger.loading(`Waiting for confirmation...`);
        const receipt = await txResponse.wait();

        if (receipt.status === 1) {
          logger.success(`Transaction successful! Gas used: ${receipt.gasUsed.toString()}`);
          await randomDelay(2000, 4000);

          // Track transaction with Euclid
          const metaPayload = {
            asset_in_type: 'native',
            releases: [
              {
                dex: 'euclid',
                release_address: [
                  {
                    chain_uid: config.chainUid,
                    address: walletAddress,
                    amount: amountOut
                  }
                ],
                token: targetToken,
                amount: ''
              }
            ],
            swaps: {
              path: [
                {
                  route: config.swapRoute,
                  dex: 'euclid',
                  chain_uid: 'vsl',
                  amount_in: ethValue.toString(),
                  amount_out: amountOut
                }
              ]
            }
          };

          await retry(
            () => axiosInstance.post(
              'https://testnet.api.euclidprotocol.com/api/v1/txn/track/swap',
              {
                chain: 'arbitrum',
                tx_hash: txResponse.hash,
                meta: JSON.stringify(metaPayload)
              }
            ),
            20,
            5000,
            useProxy ? proxies : null
          );
          logger.success(`Transaction tracked with Euclid`);

          // Track with Intract
          await retry(
            () => axiosInstance.post(
              'https://testnet.euclidswap.io/api/intract-track',
              {
                chain_uid: 'arbitrum',
                tx_hash: txResponse.hash,
                wallet_address: walletAddress,
                type: 'swap'
              }
            ),
            20,
            5000,
            useProxy ? proxies : null
          );
          logger.success(`Transaction tracked with Intract`);
          logger.step(`View transaction: ${colors.cyan}https://sepolia.arbiscan.io/tx/${txResponse.hash}`);
        } else {
          logger.error(`Transaction failed!`);
        }

        // Delay before next transaction
        if (i < numTransactions - 1) {
          const delay = 60000 + Math.floor(Math.random() * 30000);
          logger.loading(`Waiting ${Math.round(delay / 1000)} seconds before next transaction...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        logger.error(`Error during transaction: ${error.message}`);
        if (error.reason) logger.error(`Reason: ${error.reason}`);
        if (error.response?.status === 429) {
          logger.warn(`Rate limit hit. Waiting 30s before continuing...`);
          await new Promise(resolve => setTimeout(resolve, 30000));
        }
      }
      console.log();
    }

    logger.success(`All transactions completed!`);
  } catch (error) {
    logger.error(`Fatal error: ${error.message}`);
  } finally {
    rl.close();
  }
}

main().catch(error => {
  logger.error(`Fatal error: ${error.message}`);
  rl.close();
});