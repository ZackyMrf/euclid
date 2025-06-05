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
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

// Simplified logger
const logger = {
  info: (msg) => console.log(`${colors.green}[i] ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}[!] ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}[✗] ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}[✓] ${msg}${colors.reset}`),
  step: (msg) => console.log(`${colors.white}[>] ${msg}${colors.reset}`),
  loading: (msg) => console.log(`${colors.blue}[⟳] ${msg}${colors.reset}`),
  account: (msg) => console.log(`${colors.magenta}[A] ${msg}${colors.reset}`),
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

// Random user agent generator
const getRandomUserAgent = () => {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.2151.97',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.2151.93'
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
};

// Load accounts from .env file
const loadAccounts = () => {
  try {
    if (!fs.existsSync('.env')) {
      logger.error('No .env file found. Please create one with PRIVATE_KEY entries.');
      return [];
    }
    
    const envData = fs.readFileSync('.env', 'utf8');
    const lines = envData.split('\n');
    
    // Extract all private keys from lines that start with PRIVATE_KEY
    const accounts = [];
    
    for (const line of lines) {
      if (line.trim().startsWith('PRIVATE_KEY')) {
        // Extract everything after the equals sign
        const parts = line.split('=');
        if (parts.length > 1) {
          const key = parts.slice(1).join('=').trim();
          // Remove quotes if present
          const cleanKey = key.replace(/^["']|["']$/g, '');
          if (cleanKey) {
            accounts.push(cleanKey);
          }
        }
      }
    }
    
    return accounts;
  } catch (error) {
    logger.warn(`Failed to load accounts from .env: ${error.message}`);
    return [];
  }
};

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

// Test if a proxy is working
const testProxy = async (proxy) => {
  try {
    if (!proxy) return false;
    
    const formattedProxy = formatProxy(proxy);
    if (!formattedProxy) return false;
    
    const proxyUrl = `http://${formattedProxy.auth.username}:${formattedProxy.auth.password}@${formattedProxy.host}:${formattedProxy.port}`;
    const agent = new HttpsProxyAgent(proxyUrl);
    
    const response = await axios.get('https://httpbin.org/ip', {
      httpsAgent: agent,
      proxy: false,
      timeout: 10000
    });
    
    return response.status === 200;
  } catch (error) {
    return false;
  }
};

// Find a working proxy
const findWorkingProxy = async (proxies) => {
  if (!proxies || proxies.length === 0) return null;
  
  logger.loading('Testing proxies...');
  
  // Try up to 5 random proxies
  for (let i = 0; i < Math.min(5, proxies.length); i++) {
    const proxy = getRandomProxy(proxies);
    logger.step(`Testing proxy ${i + 1}/5: ${proxy.split('@')[1]}`);
    
    if (await testProxy(proxy)) {
      logger.success(`Found working proxy: ${proxy.split('@')[1]}`);
      return proxy;
    }
  }
  
  logger.warn('No working proxy found after 5 attempts. Will try randomly during requests.');
  return null;
};

// Create axios instance with proper headers and optional proxy
const createAxiosInstance = (proxy = null) => {
  const userAgent = getRandomUserAgent();
  
  const config = {
    timeout: 30000,
    headers: {
      'accept': 'application/json, text/plain, */*',
      'content-type': 'application/json',
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': userAgent,
      'origin': 'https://testnet.euclidswap.io',
      'referer': 'https://testnet.euclidswap.io/',
      'sec-ch-ua': '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'cross-site'
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

// Improved retry function with better proxy rotation and error handling
const retry = async (fn, retries = 20, baseDelay = 5000, proxies = null) => {
  let currentProxy = proxies && proxies.length > 0 ? getRandomProxy(proxies) : null;
  let axiosInstance = createAxiosInstance(currentProxy);
  
  for (let i = 0; i < retries; i++) {
    try {
      return await fn(axiosInstance);
    } catch (error) {
      if (i === retries - 1) throw error;
      
      const status = error.response?.status;
      const isRateLimit = status === 429;
      const isForbidden = status === 403;
      
      // Calculate delay with some randomness
      const delay = isRateLimit 
        ? baseDelay * Math.pow(1.5, Math.min(i, 5)) + Math.random() * 1000
        : baseDelay + Math.random() * 2000;
      
      // Switch proxy for 403 or 429 errors if proxies are available
      let proxyMessage = '';
      if ((isRateLimit || isForbidden) && proxies && proxies.length > 0) {
        currentProxy = getRandomProxy(proxies);
        axiosInstance = createAxiosInstance(currentProxy);
        proxyMessage = ` Switching to new proxy: ${currentProxy.split('@')[1]}`;
      }
      
      const errorType = isRateLimit ? 'Rate limit hit' : 
                        isForbidden ? 'Access forbidden (403)' : 
                        'API call failed';
        
      logger.warn(`${errorType}: ${error.message}. Retry ${i + 1}/${retries} in ${Math.round(delay/1000)}s...${proxyMessage}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
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

// Process transactions for a single account
async function processAccount(accountIndex, privateKey, config) {
  const {
    swapType, 
    numTransactions, 
    ethAmount, 
    useProxy, 
    proxies, 
    provider
  } = config;
  
  try {
    // Setup wallet
    const wallet = isEthersV6
      ? new ethers.Wallet(privateKey, provider)
      : new ethers.Wallet(privateKey, provider);

    const walletAddress = wallet.address;
    const contractAddress = '0x7f2CC9FE79961f628Da671Ac62d1f2896638edd5';

    // Display account info
    logger.account(`Account ${accountIndex + 1}: ${colors.yellow}${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`);

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
      
      logger.error(`Insufficient ETH balance for account ${accountIndex + 1}. Required: ${formattedRequired} ETH, Available: ${formattedBalance} ETH`);
      return { success: 0, failed: numTransactions };
    }

    logger.info(`Starting ${numTransactions} transactions for account ${accountIndex + 1}`);
    
    let successCount = 0;
    let failedCount = 0;
    
    // Find a working proxy if enabled
    let workingProxy = null;
    if (useProxy && proxies.length > 0) {
      workingProxy = await findWorkingProxy(proxies);
    }

    // Execute transactions
    for (let i = 0; i < numTransactions; i++) {
      // Determine target token
      let targetToken;
      if (swapType === '4') {
        const options = ['euclid', 'andr', 'mon'];
        targetToken = options[Math.floor(Math.random() * options.length)];
      } else {
        targetToken = swapType === '1' ? 'euclid' : swapType === '2' ? 'andr' : 'mon';
      }
      
      const tokenConfig = TOKEN_CONFIGS[targetToken];
      logger.loading(`Account ${accountIndex + 1} | TX ${i + 1}/${numTransactions} (ETH to ${targetToken.toUpperCase()}):`);
      
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
                chain_uid: tokenConfig.chainUid
              },
              limit: {
                less_than_or_equal: tokenConfig.defaultAmountOut
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
                route: tokenConfig.swapRoute,
                dex: 'euclid',
                amount_in: ethValue.toString(),
                amount_out: '0',
                chain_uid: 'vsl',
                amount_out_for_hops: tokenConfig.swapRoute.map(token => `${token}: 0`)
              }
            ],
            total_price_impact: tokenConfig.priceImpact
          }
        };

        // Get quote with retry - pass proxies for potential rotation
        const quoteResponse = await retry(
          (axios) => axios.post(
            'https://testnet.api.euclidprotocol.com:8081/api/v1/execute/astro/swap',
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
          : tokenConfig.defaultAmountOut;
          
        if (!amountOut || amountOut === '0') {
          logger.error(`Invalid amount_out in API response. Skipping transaction.`);
          failedCount++;
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
                amount_out_for_hops: tokenConfig.amountOutHops
              }
            ],
            total_price_impact: tokenConfig.priceImpact
          }
        };

        // Get swap data with retry
        const swapResponse = await retry(
          (axios) => axios.post(
            'https://testnet.api.euclidprotocol.com:8081/api/v1/execute/astro/swap',
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
          failedCount++;
          continue;
        }

        if (swapResponse.data.sender?.address.toLowerCase() !== walletAddress.toLowerCase()) {
          logger.error(`API returned incorrect sender address. Skipping transaction.`);
          failedCount++;
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
          failedCount++;
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
          successCount++;
          await randomDelay(2000, 4000);

          // Track transaction with Euclid
          const metaPayload = {
            asset_in_type: 'native',
            releases: [
              {
                dex: 'euclid',
                release_address: [
                  {
                    chain_uid: tokenConfig.chainUid,
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
                  route: tokenConfig.swapRoute,
                  dex: 'euclid',
                  chain_uid: 'vsl',
                  amount_in: ethValue.toString(),
                  amount_out: amountOut
                }
              ]
            }
          };

          await retry(
            (axios) => axios.post(
              'https://testnet.api.euclidprotocol.com:8081/api/v1/txn/track/swap',
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
            (axios) => axios.post(
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
          failedCount++;
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
        } else if (error.response?.status === 403) {
          logger.warn(`Access forbidden (403). Waiting 45s before trying with a different proxy...`);
          await new Promise(resolve => setTimeout(resolve, 45000));
        }
        failedCount++;
      }
      console.log();
    }

    logger.success(`Account ${accountIndex + 1} completed! Success: ${successCount}, Failed: ${failedCount}`);
    return { success: successCount, failed: failedCount };
  } catch (error) {
    logger.error(`Fatal error for account ${accountIndex + 1}: ${error.message}`);
    return { success: 0, failed: numTransactions };
  }
}

// Main function
async function main() {
  logger.banner();

  try {
    // Load accounts and proxies
    const accounts = loadAccounts();
    const proxies = loadProxies();
    const useProxies = proxies.length > 0;
    
    if (accounts.length === 0) {
      logger.error('No accounts found. Please add PRIVATE_KEY entries in your .env file, one per line.');
      logger.info('Example: PRIVATE_KEY="your_private_key_here"');
      rl.close();
      return;
    }
    
    logger.info(`Loaded ${accounts.length} accounts from .env file`);
    
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
    const numTransactions = parseInt(await question(`${colors.cyan}Number of transactions per account: ${colors.reset}`));
    const ethAmount = parseFloat(await question(`${colors.cyan}ETH amount per transaction: ${colors.reset}`));

    if (isNaN(numTransactions) || isNaN(ethAmount) || numTransactions <= 0 || ethAmount <= 0) {
      logger.error(`Invalid input. Please enter positive numbers.`);
      rl.close();
      return;
    }
    
    // Select accounts to use
    console.log(`${colors.cyan}Available accounts:${colors.reset}`);
    accounts.forEach((_, i) => {
      console.log(`${i+1}. Account ${i+1}`);
    });
    console.log(`${accounts.length+1}. All accounts`);
    console.log(`${accounts.length+2}. Exit\n`);
    
    const accountChoice = parseInt(await question(`${colors.cyan}Choose account(s) to use: ${colors.reset}`));
    
    if (isNaN(accountChoice) || accountChoice < 1 || accountChoice > accounts.length + 2) {
      logger.error(`Invalid option.`);
      rl.close();
      return;
    }
    
    if (accountChoice === accounts.length + 2) {
      logger.info(`Exiting...`);
      rl.close();
      return;
    }
    
    let selectedAccounts = [];
    if (accountChoice === accounts.length + 1) {
      // All accounts
      selectedAccounts = accounts.map((acc, i) => i);
    } else {
      // Single account
      selectedAccounts = [accountChoice - 1];
    }

    // Proxy option
    let useProxy = false;
    if (useProxies) {
      const proxyOption = await question(`${colors.cyan}Use proxies? (y/n): ${colors.reset}`);
      useProxy = proxyOption.toLowerCase() === 'y';
    }

    // Setup provider
    const provider = isEthersV6 
      ? new ethers.JsonRpcProvider('https://sepolia-rollup.arbitrum.io/rpc')
      : new ethers.providers.JsonRpcProvider('https://sepolia-rollup.arbitrum.io/rpc');

    logger.info(`Connected to network: ${colors.yellow}Arbitrum Sepolia (Chain ID: 421614)\n`);

    // Show transaction summary
    const tokenName = swapType === '1' ? 'EUCLID' : swapType === '2' ? 'ANDR' : swapType === '3' ? 'MON' : 'Random';
    const totalTransactions = numTransactions * selectedAccounts.length;
      
    logger.warn(`Transaction Summary:`);
    logger.step(`Swap type: ${colors.yellow}${tokenName}`);
    logger.step(`Accounts: ${colors.yellow}${selectedAccounts.length}`);
    logger.step(`Transactions per account: ${colors.yellow}${numTransactions}`);
    logger.step(`Total transactions: ${colors.yellow}${totalTransactions}`);
    logger.step(`ETH per tx: ${colors.yellow}${ethAmount} ETH`);
    logger.step(`Using proxies: ${colors.yellow}${useProxy ? 'Yes' : 'No'}`);
    logger.step(`Retry policy: ${colors.yellow}20 attempts with improved backoff\n`);

    const confirm = await question(`${colors.yellow}Continue? (y/n): ${colors.reset}`);
    if (confirm.toLowerCase() !== 'y') {
      logger.error(`Operation cancelled.`);
      rl.close();
      return;
    }

    // Process each account
    let totalSuccess = 0;
    let totalFailed = 0;
    
    for (let i = 0; i < selectedAccounts.length; i++) {
      const accountIndex = selectedAccounts[i];
      const privateKey = accounts[accountIndex];
      
      const config = {
        swapType,
        numTransactions,
        ethAmount,
        useProxy,
        proxies,
        provider
      };
      
      const result = await processAccount(accountIndex, privateKey, config);
      totalSuccess += result.success;
      totalFailed += result.failed;
      
      // Add delay between accounts
      if (i < selectedAccounts.length - 1) {
        const delay = 30000 + Math.floor(Math.random() * 30000);
        logger.loading(`Waiting ${Math.round(delay / 1000)} seconds before next account...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    logger.success(`All accounts completed!`);
    logger.info(`Summary: ${totalSuccess} successful transactions, ${totalFailed} failed`);
    
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