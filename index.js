const express = require('express');
const { ethers } = require('ethers');
const WebSocket = require('ws');
require('dotenv').config();

const app = express();
const port = process.env.PORT;

const RPC_URL = 'https://testnet.dplabs-internal.com';
const CONTRACT_ADDRESS = '0xbb24da1f6aaa4b0cb3ff9ae971576790bb65673c';

const ABI = [
  {
    "inputs": [],
    "name": "getAllConditionalOrders",
    "outputs": [
      { "internalType": "uint256[]", "name": "orderIds", "type": "uint256[]" },
      { "internalType": "uint256[]", "name": "assetIndexes", "type": "uint256[]" },
      { "internalType": "uint256[]", "name": "targetPrices", "type": "uint256[]" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getAllLiquidationPrices",
    "outputs": [
      { "internalType": "uint256[]", "name": "positionIds", "type": "uint256[]" },
      { "internalType": "uint256[]", "name": "assetIndexes", "type": "uint256[]" },
      { "internalType": "uint256[]", "name": "prices", "type": "uint256[]" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getAllStopLosses",
    "outputs": [
      { "internalType": "uint256[]", "name": "positionIds", "type": "uint256[]" },
      { "internalType": "uint256[]", "name": "assetIndexes", "type": "uint256[]" },
      { "internalType": "uint256[]", "name": "prices", "type": "uint256[]" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getAllTakeProfits",
    "outputs": [
      { "internalType": "uint256[]", "name": "positionIds", "type": "uint256[]" },
      { "internalType": "uint256[]", "name": "assetIndexes", "type": "uint256[]" },
      { "internalType": "uint256[]", "name": "prices", "type": "uint256[]" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

function withinTolerance(wsPrice, targetPrice) {
  const diff = Math.abs(wsPrice - targetPrice);
  return diff / targetPrice <= 0.001;
}

app.get('/check-prices', async (req, res) => {
  try {
    const [
      conditional,
      liquidation,
      stopLoss,
      takeProfit
    ] = await Promise.all([
      contract.getAllConditionalOrders(),
      contract.getAllLiquidationPrices(),
      contract.getAllStopLosses(),
      contract.getAllTakeProfits()
    ]);

    const indexes = new Set([
      ...conditional[1],
      ...liquidation[1],
      ...stopLoss[1],
      ...takeProfit[1]
    ].map(x => x.toString()));

    const socket = new WebSocket("wss://wss-production-9302.up.railway.app");

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const matched = [];

      Object.entries(data).forEach(([_, payload]) => {
        const item = payload?.instruments?.[0];
        const assetIndex = payload?.id?.toString();
        if (!item || !indexes.has(assetIndex)) return;

        const wsPrice = parseFloat(item.currentPrice) * 1e18;

        stopLoss[0].forEach((id, i) => {
          if (stopLoss[1][i].toString() === assetIndex && withinTolerance(wsPrice, stopLoss[2][i].toString())) {
            matched.push({ positionId: id.toString(), assetIndex, type: 0 });
          }
        });
        takeProfit[0].forEach((id, i) => {
          if (takeProfit[1][i].toString() === assetIndex && withinTolerance(wsPrice, takeProfit[2][i].toString())) {
            matched.push({ positionId: id.toString(), assetIndex, type: 1 });
          }
        });
        liquidation[0].forEach((id, i) => {
          if (liquidation[1][i].toString() === assetIndex && withinTolerance(wsPrice, liquidation[2][i].toString())) {
            matched.push({ positionId: id.toString(), assetIndex, type: 2 });
          }
        });
        conditional[0].forEach((id, i) => {
          if (conditional[1][i].toString() === assetIndex && withinTolerance(wsPrice, conditional[2][i].toString())) {
            matched.push({ positionId: id.toString(), assetIndex, type: 3 });
          }
        });
      });

      socket.close();
      res.json({ matched });
    };

    socket.onerror = (err) => {
      res.status(500).json({ error: 'WebSocket error', detail: err.message });
    };

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`🟢 Checker API live on port ${port}`);
});
