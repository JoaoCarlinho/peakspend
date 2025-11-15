import { Container, Paper, Typography, Box, TextField, Button, Avatar, Stack } from '@mui/material';
import { AccountCircle } from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';

export function ProfilePage() {
  const { user } = useAuth();

  if (!user) return null;

  const userInitial = user.name?.[0] || user.email[0];

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper sx={{ p: 4 }}>
        <Typography variant="h4" gutterBottom>
          Profile
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Manage your account information
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', my: 4 }}>
          <Avatar sx={{ width: 100, height: 100, bgcolor: 'primary.main', fontSize: '3rem', mb: 2 }}>
            {userInitial.toUpperCase()}
          </Avatar>
          <Typography variant="h6">{user.name || 'User'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {user.email}
          </Typography>
        </Box>

        <Stack spacing={3} sx={{ mt: 4 }}>
          <TextField
            label="Name"
            defaultValue={user.name || ''}
            fullWidth
            disabled
            helperText="Profile editing coming soon"
          />
          <TextField
            label="Email"
            defaultValue={user.email}
            fullWidth
            disabled
            helperText="Email cannot be changed"
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button variant="outlined" disabled>
              Cancel
            </Button>
            <Button variant="contained" disabled>
              Save Changes
            </Button>
          </Box>
        </Stack>

        <Box sx={{ mt: 4, p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
          <Typography variant="body2" color="info.dark">
            <AccountCircle fontSize="small" sx={{ verticalAlign: 'middle', mr: 1 }} />
            Profile editing functionality will be available in a future update.
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
}
