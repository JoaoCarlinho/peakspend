import { AppBar, Toolbar, Typography, Button, Box, IconButton } from '@mui/material';
import {
  Receipt as ReceiptIcon,
  Category as CategoryIcon,
  Analytics as AnalyticsIcon,
  Menu as MenuIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { LearningBadge } from '../improvement-metrics/LearningBadge';

export function AppHeader() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <AppBar position="sticky" elevation={1}>
      <Toolbar>
        <Typography
          variant="h6"
          component="div"
          sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1 }}
          onClick={() => navigate('/expenses')}
        >
          💰 PeakSpend
        </Typography>

        <Box sx={{ flexGrow: 1, display: 'flex', gap: 1, ml: 4 }}>
          <Button
            color="inherit"
            startIcon={<ReceiptIcon />}
            onClick={() => navigate('/expenses')}
            sx={{
              fontWeight: isActive('/expenses') ? 'bold' : 'normal',
              borderBottom: isActive('/expenses') ? '2px solid white' : 'none',
            }}
          >
            Expenses
          </Button>
          <Button
            color="inherit"
            startIcon={<CategoryIcon />}
            onClick={() => navigate('/categories')}
            sx={{
              fontWeight: isActive('/categories') ? 'bold' : 'normal',
              borderBottom: isActive('/categories') ? '2px solid white' : 'none',
            }}
          >
            Categories
          </Button>
          <Button
            color="inherit"
            startIcon={<AnalyticsIcon />}
            onClick={() => navigate('/ml-dashboard')}
            sx={{
              fontWeight: isActive('/ml-dashboard') ? 'bold' : 'normal',
              borderBottom: isActive('/ml-dashboard') ? '2px solid white' : 'none',
            }}
          >
            ML Dashboard
          </Button>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <LearningBadge />
        </Box>
      </Toolbar>
    </AppBar>
  );
}
