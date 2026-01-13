import './App.css';
import poweredByBgg from './assets/powered-by-bgg-reversed-rgb.svg';
import CollectionTable from './components/CollectionTable';
import { Container, Box, TextField, Button, Typography, CircularProgress, Alert } from '@mui/material';
import { useState } from 'react';

function App() {
  const [usernameInput, setUsernameInput] = useState('James_Orr');
  const [activeUsername, setActiveUsername] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);

  const handleLoadCollection = () => {
    if (usernameInput.trim()) {
      setActiveUsername(usernameInput.trim());
      setImportMessage(null);
    }
  };

  const handleImportData = async () => {
    if (!usernameInput.trim()) {
      setImportMessage({ type: 'error', text: 'Please enter a username' });
      return;
    }

    try {
      setImporting(true);
      setImportMessage({ type: 'info', text: 'Importing data from BoardGameGeek... This may take a few minutes.' });

      const response = await fetch(`http://localhost:3000/api/user/collection/${usernameInput.trim()}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Import failed: ${response.status}`);
      }

      const result = await response.json();
      setImportMessage({
        type: 'success',
        text: `Successfully imported ${result.stats.totalGamesInCollection} games!`
      });

      // Automatically load the collection after successful import
      setActiveUsername(usernameInput.trim());
    } catch (err) {
      setImportMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to import data'
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Container maxWidth="xl">
      <Box sx={{ my: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom sx={{ color: 'primary.main' }}>
          Board Game Suggestor
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 3, mb: 3 }}>
          <TextField
            label="BoardGameGeek Username"
            variant="outlined"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleLoadCollection();
              }
            }}
            sx={{ minWidth: 300 }}
            disabled={importing}
          />
          <Button
            variant="contained"
            onClick={handleLoadCollection}
            size="large"
            disabled={importing}
          >
            Load Collection
          </Button>
          <Button
            variant="outlined"
            onClick={handleImportData}
            size="large"
            disabled={importing}
            startIcon={importing ? <CircularProgress size={20} /> : null}
          >
            {importing ? 'Importing...' : 'Import from BGG'}
          </Button>
        </Box>

        {importMessage && (
          <Alert severity={importMessage.type} sx={{ mb: 3 }}>
            {importMessage.text}
          </Alert>
        )}

        <img src={poweredByBgg} alt="Powered by BoardGameGeek" style={{ maxWidth: '200px' }} />

        {activeUsername && (
          <Box sx={{ mt: 4 }}>
            <CollectionTable username={activeUsername} />
          </Box>
        )}
      </Box>
    </Container>
  )
}

export default App
