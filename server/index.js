// server/index.js
const express = require('express');
const cors = require('cors');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} = require('@simplewebauthn/server');

const app = express();
// Ensures Express parses JSON bodies sent by React Native
app.use(express.json());
app.use(cors());

// MUST match your GitHub Pages root domain
const rpID = 'anurags0752-cyber.github.io';

// Android Credential Manager sends an android:apk-key-hash:... origin.
// Add your hash here once it prints to the console.
// Android Credential Manager sends an android:apk-key-hash:... origin.
const allowedOrigins = [
  `https://${rpID}`,
  'android:apk-key-hash:OpDuduCtcGZNiyuWuENcD6zLP0WkJGpJxD4VHTjtf3o'
];

// Stored in memory for local testing
let currentChallenge = '';

app.post('/generate-registration-options', async (req, res) => {
  try {
    const username = req.body?.username || 'anurag';

    const options = await generateRegistrationOptions({
      rpName: 'ERC4337 Wallet',
      rpID,
      userID: new Uint8Array(Buffer.from(username)),
      userName: username,
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
      },
    });

    currentChallenge = options.challenge;
    res.json(options);
  } catch (error) {
    console.error('Server error generating options:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/verify-registration', async (req, res) => {
  try {
    let passkeyResponse = req.body;

    // DEBUG: Print exactly what the phone sent to the server
    console.log('\n--- Received Payload from Phone ---');
    console.dir(passkeyResponse, { depth: null });
    
    // Auto-fix 1: Empty body (Client forgot Content-Type header)
    if (!passkeyResponse || Object.keys(passkeyResponse).length === 0) {
      throw new Error("Received empty body. Check your React Native fetch() headers. You must include { 'Content-Type': 'application/json' }");
    }

    // Auto-fix 2: The client nested the result in another object (e.g., { data: passkeyResult })
    if (passkeyResponse.data && passkeyResponse.data.id) {
      passkeyResponse = passkeyResponse.data;
    } else if (passkeyResponse.passkeyResponse && passkeyResponse.passkeyResponse.id) {
      passkeyResponse = passkeyResponse.passkeyResponse;
    } else if (passkeyResponse.response && !passkeyResponse.id && passkeyResponse.response.id) {
      passkeyResponse = passkeyResponse.response;
    }

    if (!currentChallenge) {
      throw new Error('No challenge found in server memory. Please generate options first.');
    }

    const verification = await verifyRegistrationResponse({
      response: passkeyResponse,
      expectedChallenge: currentChallenge,
      expectedOrigin: allowedOrigins,
      expectedRPID: rpID,
    });

    // Clear challenge after single use
    currentChallenge = '';

    console.log('\n✅ Passkey successfully verified!');
    if (verification.registrationInfo) {
      console.log('Credential ID:', Buffer.from(verification.registrationInfo.credential.id).toString('base64url'));
      console.log('Public Key (Raw Bytes):', Buffer.from(verification.registrationInfo.credential.publicKey).toString('hex'));
    }

    res.json({
      verified: verification.verified,
      registrationInfo: verification.registrationInfo,
    });
  } catch (error) {
    console.error('\n❌ VERIFICATION FAILED:', error.message);
    res.status(400).json({ error: error.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});