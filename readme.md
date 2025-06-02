# Euclid Bot

A command-line tool for automating interactions with Euclid Protocol on Arbitrum Sepolia testnet. This bot helps you participate in the Euclid ecosystem by automating token swaps, potentially increasing your chances for future airdrops.

## Features

- Swap ETH to EUCLID, ANDR, or MON tokens
- Support for multiple accounts from a single .env file
- Proxy rotation to avoid rate limits
- Interactive CLI with colorful output
- Automatic transaction tracking with Euclid and Intract
- Configurable transaction amounts and counts
- Exponential backoff retry mechanism
- Smart gas estimation

## Prerequisites

- Node.js v14 or higher
- One or more Ethereum wallets with Arbitrum Sepolia ETH
- (Optional) Proxy list for avoiding rate limits

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/zackymrf/euclid.git
   cd euclid-bot
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Configure your `.env` file with one or more private keys:
   ```
   PRIVATE_KEY="your_first_private_key_here"
   PRIVATE_KEY="your_second_private_key_here"
   PRIVATE_KEY="your_third_private_key_here"
   ```

4. (Optional) Add proxies to `proxy.txt` in the format:
   ```
   username:password@ip:port
   ```

## Usage

1. Start the bot:
   ```
   npm start
   ```

2. Follow the interactive prompts:
   - Choose swap type (EUCLID, ANDR, MON, or Random)
   - Enter number of transactions per account
   - Enter ETH amount per transaction
   - Select which accounts to use (single, all, or exit)
   - Choose whether to use proxies
   - Confirm the transaction summary

## Multi-Account Support

The bot can now process multiple accounts sequentially. You can:
- Add multiple private keys to your `.env` file (each starting with `PRIVATE_KEY=`)
- Choose a specific account or run all accounts during execution
- See individual and aggregate transaction statistics

## Transaction Types

1. **ETH - EUCLID**: Swaps ETH to EUCLID token
2. **ETH - ANDR**: Swaps ETH to ANDR token
3. **ETH - MON**: Swaps ETH to MON token
4. **Random Swap**: Randomly selects between EUCLID, ANDR, and MON for each transaction

## Proxy Support

The bot supports HTTP proxies for API requests to avoid rate limits. Add your proxies to `proxy.txt` with each proxy on a new line in the format `username:password@ip:port`.

## Security Notes

- Never share your `.env` file or private keys
- This bot is for educational purposes only
- Test with small amounts first
- The bot operates on the Arbitrum Sepolia testnet

## Troubleshooting

- **Rate limits**: Add more proxies to `proxy.txt`
- **Transaction failures**: Check your ETH balance and network status
- **API errors**: The bot includes automatic retries with exponential backoff

## Disclaimer

This tool is for educational purposes only. Use at your own risk. The developers are not responsible for any losses incurred while using this tool.
```