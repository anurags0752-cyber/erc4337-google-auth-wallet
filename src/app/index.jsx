import { useState } from 'react';
import { Alert, Button, StyleSheet, Text, View } from 'react-native';
import { Passkey } from 'react-native-passkey';

export default function HomeScreen() {
  const [status, setStatus] = useState('Waiting to start...');
  const username = 'anurag_test_user';
  const SERVER_URL = 'https://supreme-tribble-69j47w4xggqj3rjrj-3000.app.github.dev'; // <-- Update this!https://supreme-tribble-69j47w4xggqj3rjrj-3000.app.github.dev/

  const handleRegister = async () => {
    try {
      setStatus('Fetching challenge from server...');
      
      // 1. Get the challenge options from your Express backend
      const optionsResponse = await fetch(`${SERVER_URL}/generate-registration-options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const options = await optionsResponse.json();

      setStatus('Triggering Android Biometric Prompt...');

      // 2. Wake up Android Credential Manager to sign the challenge
      // react-native-passkey natively handles the base64url parsing
      const passkeyResult = await Passkey.create(options);

      setStatus('Verifying signature on server...');

      // 3. Send the hardware signature back to the server for verification
      const verifyResponse = await fetch(`${SERVER_URL}/verify-registration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username, 
          response: passkeyResult 
        }),
      });

      const verifyData = await verifyResponse.json();

      if (verifyData.verified) {
        setStatus('✅ Passkey Registered! (x,y) extracted on server.');
        Alert.alert('Success!', verifyData.message);
      } else {
        setStatus('❌ Verification failed on server.');
      }

    } catch (error) {
      console.error(error);
      setStatus(`Error: ${error.message}`);
      Alert.alert('Passkey Error', error.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ERC-4337 Passkey Test</Text>
      <Text style={styles.status}>{status}</Text>
      
      <Button 
        title="Create Smart Account (Trigger Fingerprint)" 
        onPress={handleRegister} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  status: { fontSize: 16, marginBottom: 40, textAlign: 'center', color: '#666' }
});