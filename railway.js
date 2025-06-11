const express = require('express');
const { ethers } = require('ethers');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const ABI = [
  {
    "inputs": [
      { "internalType": "uint256", "name": "orderId", "type": "uint256" },
      { "internalType": "bytes", "name": "proof", "type": "bytes" }
    ],
    "name": "executeConditionalOrder",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

app.post('/execute', async (req, res) => {
  const { orderId, index } = req.body;
  if (typeof orderId === 'undefined' || typeof index === 'undefined') {
    return res.status(400).json({ error: 'orderId and index are required' });
  }

  try {
    const response = await axios.post('https://proof-production.up.railway.app/get-proof', { index });
    const proof = response.data.proof_bytes;

    const tx = await contract.executeConditionalOrder(orderId, proof);
    await tx.wait();

    res.json({ success: true, txHash: tx.hash });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Execution failed' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🟢 Executor API running on port ${port}`);
});
