import { Box } from '@mui/material';
import { AppHeader } from './AppHeader';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'grey.50' }}>
      <AppHeader />
      <Box component="main">{children}</Box>
    </Box>
  );
}
