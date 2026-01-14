import { useEffect, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Link,
  Chip,
  Box,
  CircularProgress,
  Alert,
  Typography,
  TableSortLabel
} from '@mui/material';

interface Game {
  bggId: number;
  gameName: string;
  bggLink: string;
  bggImageLink: string;
  userRating: string;
  averageRating: number | null;
  mechanics: string[];
}

interface CollectionResponse {
  username: string;
  totalGames: number;
  games: Game[];
}

interface CollectionTableProps {
  username: string;
}

export default function CollectionTable({ username }: CollectionTableProps) {
  const [collection, setCollection] = useState<CollectionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<'gameName' | 'userRating' | 'averageRating'>('gameName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    const fetchCollection = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`http://localhost:3000/api/user/collection/${username}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch collection: ${response.status}`);
        }

        const data: CollectionResponse = await response.json();
        setCollection(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    if (username) {
      fetchCollection();
    }
  }, [username]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Alert severity="info">
          <Typography variant="body1" gutterBottom>
            <strong>Collection not found for user "{username}"</strong>
          </Typography>
          <Typography variant="body2">
            This user's data hasn't been imported yet. Click the "Import from BGG" button above to fetch and populate this user's collection data from BoardGameGeek.
          </Typography>
        </Alert>
      </Box>
    );
  }

  if (!collection || collection.games.length === 0) {
    return (
      <Alert severity="info">
        <Typography variant="body1" gutterBottom>
          <strong>No games found in collection</strong>
        </Typography>
        <Typography variant="body2">
          Click the "Import from BGG" button above to fetch this user's collection from BoardGameGeek.
        </Typography>
      </Alert>
    );
  }

  const handleSortToggle = (column: 'gameName' | 'userRating' | 'averageRating') => {
    if (sortColumn === column) {
      // Toggle order if clicking the same column
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Switch to new column, default to ascending
      setSortColumn(column);
      setSortOrder('asc');
    }
  };

  const sortedGames = [...collection.games].sort((a, b) => {
    let comparison = 0;

    if (sortColumn === 'gameName') {
      comparison = a.gameName.localeCompare(b.gameName);
    } else if (sortColumn === 'userRating') {
      // Convert "N/A" and invalid ratings to 0
      const ratingA = a.userRating === 'N/A' ? 0 : parseFloat(a.userRating) || 0;
      const ratingB = b.userRating === 'N/A' ? 0 : parseFloat(b.userRating) || 0;
      comparison = ratingA - ratingB;
    } else if (sortColumn === 'averageRating') {
      // Convert null to 0 for sorting
      const ratingA = a.averageRating ?? 0;
      const ratingB = b.averageRating ?? 0;
      comparison = ratingA - ratingB;
    }

    return sortOrder === 'asc' ? comparison : -comparison;
  });

  return (
    <Box>
      <Typography variant="h5" gutterBottom sx={{ color: 'primary.main', mb: 3 }}>
        {collection.username}'s Collection ({collection.totalGames} games)
      </Typography>

      <TableContainer component={Paper} elevation={3}>
        <Table sx={{ minWidth: 650 }} aria-label="game collection table">
          <TableHead>
            <TableRow sx={{ backgroundColor: 'rgba(144, 202, 249, 0.08)' }}>
              <TableCell sx={{ fontWeight: 'bold', fontSize: '1rem' }}>Image</TableCell>
              <TableCell sx={{ fontWeight: 'bold', fontSize: '1rem' }}>
                <TableSortLabel
                  active={sortColumn === 'gameName'}
                  direction={sortColumn === 'gameName' ? sortOrder : 'asc'}
                  onClick={() => handleSortToggle('gameName')}
                  sx={{
                    '& .MuiTableSortLabel-icon': {
                      color: 'primary.main !important',
                    },
                  }}
                >
                  Game Name
                </TableSortLabel>
              </TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold', fontSize: '1rem' }}>
                <TableSortLabel
                  active={sortColumn === 'userRating'}
                  direction={sortColumn === 'userRating' ? sortOrder : 'asc'}
                  onClick={() => handleSortToggle('userRating')}
                  sx={{
                    '& .MuiTableSortLabel-icon': {
                      color: 'primary.main !important',
                    },
                  }}
                >
                  User Rating
                </TableSortLabel>
              </TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold', fontSize: '1rem' }}>
                <TableSortLabel
                  active={sortColumn === 'averageRating'}
                  direction={sortColumn === 'averageRating' ? sortOrder : 'asc'}
                  onClick={() => handleSortToggle('averageRating')}
                  sx={{
                    '& .MuiTableSortLabel-icon': {
                      color: 'primary.main !important',
                    },
                  }}
                >
                  Average Rating
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: 'bold', fontSize: '1rem' }}>Mechanics</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedGames.map((game) => (
              <TableRow
                key={game.bggId}
                sx={{
                  '&:last-child td, &:last-child th': { border: 0 },
                  '&:hover': {
                    backgroundColor: 'rgba(144, 202, 249, 0.05)',
                  },
                }}
              >
                <TableCell>
                  {game.bggImageLink ? (
                    <img
                      src={game.bggImageLink}
                      alt={game.gameName}
                      style={{
                        width: '60px',
                        height: '60px',
                        objectFit: 'cover',
                        borderRadius: '4px',
                      }}
                    />
                  ) : (
                    <Box
                      sx={{
                        width: '60px',
                        height: '60px',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                      }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        No Image
                      </Typography>
                    </Box>
                  )}
                </TableCell>
                <TableCell component="th" scope="row">
                  <Link
                    href={game.bggLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    underline="hover"
                    sx={{
                      color: 'primary.main',
                      fontWeight: 500,
                      '&:hover': {
                        color: 'primary.light',
                      }
                    }}
                  >
                    {game.gameName}
                  </Link>
                </TableCell>
                <TableCell align="center">
                  <Typography
                    variant="body1"
                    fontWeight="bold"
                    sx={{
                      color: game.userRating !== '0' && game.userRating !== 'N/A' ? 'secondary.main' : 'text.secondary',
                    }}
                  >
                    {game.userRating !== '0' && game.userRating !== 'N/A' ? game.userRating : 'Not Rated'}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Typography
                    variant="body1"
                    fontWeight="bold"
                    sx={{
                      color: game.averageRating != null ? 'primary.light' : 'text.secondary',
                    }}
                  >
                    {game.averageRating != null ? Number(game.averageRating).toFixed(2) : 'N/A'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {game.mechanics.length > 0 ? (
                      game.mechanics.map((mechanic, index) => (
                        <Chip
                          key={index}
                          label={mechanic}
                          size="small"
                          variant="outlined"
                          sx={{
                            borderColor: 'primary.main',
                            color: 'primary.light',
                            '&:hover': {
                              backgroundColor: 'rgba(144, 202, 249, 0.1)',
                            }
                          }}
                        />
                      ))
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        No mechanics listed
                      </Typography>
                    )}
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
