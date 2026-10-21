// server/index.js
const express = require('express');
const cors = require('cors');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const app = express();
// Ensures Express parses JSON bodies sent by React Native
app.use(express.json());
app.use(cors());

// MUST match your GitHub Pages root domain (assetlinks.json host)
const rpID = 'anurags0752-cyber.github.io';

// Android Credential Manager sends an android:apk-key-hash:... origin.
const allowedOrigins = [
  `https://${rpID}`,
  'android:apk-key-hash:OpDuduCtcGZNiyuWuENcD6zLP0WkJGpJxD4VHTjtf3o',
];

// In-memory store for challenges and registered passkey accounts
let currentChallenge = '';
const registeredAccounts = new Map();

app.post('/generate-registration-options', async (req, res) => {
  try {
    const username = req.body?.username || 'anurag';

    const options = await generateRegistrationOptions({
      rpName: 'ERC4337 Passkey Wallet',
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
    console.error('Server error generating registration options:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/verify-registration', async (req, res) => {
  try {
    let passkeyResponse = req.body;

    if (!passkeyResponse || Object.keys(passkeyResponse).length === 0) {
      throw new Error(
        "Received empty body. Ensure fetch() includes { 'Content-Type': 'application/json' }"
      );
    }

    const { publicKeyX, publicKeyY, smartAccountAddress, username } = passkeyResponse;

    if (passkeyResponse.data && passkeyResponse.data.id) {
      passkeyResponse = passkeyResponse.data;
    } else if (passkeyResponse.passkeyResponse && passkeyResponse.passkeyResponse.id) {
      passkeyResponse = passkeyResponse.passkeyResponse;
    } else if (
      passkeyResponse.response &&
      !passkeyResponse.id &&
      passkeyResponse.response.id
    ) {
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

    currentChallenge = '';

    if (verification.verified && verification.registrationInfo) {
      const credId = Buffer.from(verification.registrationInfo.credential.id).toString(
        'base64url'
      );
      registeredAccounts.set(passkeyResponse.id || credId, {
        credential: verification.registrationInfo.credential,
        account: {
          address: smartAccountAddress,
          publicKeyX,
          publicKeyY,
          credentialId: passkeyResponse.id || credId,
          username: username || 'anurag_wallet',
          createdAt: new Date().toISOString(),
        },
      });
    }

    res.json({
      verified: verification.verified,
      registrationInfo: verification.registrationInfo,
    });
  } catch (error) {
    console.error('VERIFICATION FAILED:', error.message);
    res.status(400).json({ error: error.message });
  }
});

app.post('/generate-authentication-options', async (req, res) => {
  try {
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
    });
    currentChallenge = options.challenge;
    res.json(options);
  } catch (error) {
    console.error('Server error generating authentication options:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/verify-authentication', async (req, res) => {
  try {
    const assertion = req.body;
    const stored = registeredAccounts.get(assertion?.id);

    if (!stored) {
      return res.json({ verified: true, account: null });
    }

    if (currentChallenge) {
      await verifyAuthenticationResponse({
        response: assertion,
        expectedChallenge: currentChallenge,
        expectedOrigin: allowedOrigins,
        expectedRPID: rpID,
        credential: stored.credential,
      });
      currentChallenge = '';
    }

    res.json({
      verified: true,
      account: stored.account,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
