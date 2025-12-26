import {
  Container,
  Paper,
  Typography,
  Box,
  Switch,
  FormControlLabel,
  Divider,
  Stack,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Tabs,
  Tab,
} from '@mui/material';
import { Settings as SettingsIcon } from '@mui/icons-material';
import { useState } from 'react';
import { GoalsList } from '../components/goals';
import { BankAccountList, PaymentCardList } from '../components/settings';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export function SettingsPage() {
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Paper sx={{ p: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <SettingsIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4">Settings</Typography>
            <Typography variant="body2" color="text.secondary">
              Manage your account, goals, and payment methods
            </Typography>
          </Box>
        </Box>

        <Tabs value={tabValue} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="General" />
          <Tab label="Budget Goals" />
          <Tab label="Payment Methods" />
        </Tabs>

        {/* General Settings Tab */}
        <TabPanel value={tabValue} index={0}>
          <Stack spacing={4}>
            {/* Display Settings */}
            <Box>
              <Typography variant="h6" gutterBottom>
                Display
              </Typography>
              <Stack spacing={2}>
                <FormControl fullWidth disabled>
                  <InputLabel>Theme</InputLabel>
                  <Select value="light" label="Theme">
                    <MenuItem value="light">Light</MenuItem>
                    <MenuItem value="dark">Dark</MenuItem>
                    <MenuItem value="auto">Auto</MenuItem>
                  </Select>
                </FormControl>
                <FormControlLabel
                  control={<Switch defaultChecked disabled />}
                  label="Compact view for expense lists"
                />
              </Stack>
            </Box>

            <Divider />

            {/* Notification Settings */}
            <Box>
              <Typography variant="h6" gutterBottom>
                Notifications
              </Typography>
              <Stack spacing={2}>
                <FormControlLabel
                  control={<Switch defaultChecked disabled />}
                  label="Email notifications for weekly summaries"
                />
                <FormControlLabel
                  control={<Switch disabled />}
                  label="Push notifications for spending alerts"
                />
                <FormControlLabel
                  control={<Switch defaultChecked disabled />}
                  label="ML categorization improvement suggestions"
                />
              </Stack>
            </Box>

            <Divider />

            {/* Currency & Localization */}
            <Box>
              <Typography variant="h6" gutterBottom>
                Currency & Localization
              </Typography>
              <Stack spacing={2}>
                <FormControl fullWidth disabled>
                  <InputLabel>Currency</InputLabel>
                  <Select value="USD" label="Currency">
                    <MenuItem value="USD">USD ($)</MenuItem>
                    <MenuItem value="EUR">EUR (€)</MenuItem>
                    <MenuItem value="GBP">GBP (£)</MenuItem>
                  </Select>
                </FormControl>
                <FormControl fullWidth disabled>
                  <InputLabel>Date Format</InputLabel>
                  <Select value="MM/DD/YYYY" label="Date Format">
                    <MenuItem value="MM/DD/YYYY">MM/DD/YYYY</MenuItem>
                    <MenuItem value="DD/MM/YYYY">DD/MM/YYYY</MenuItem>
                    <MenuItem value="YYYY-MM-DD">YYYY-MM-DD</MenuItem>
                  </Select>
                </FormControl>
              </Stack>
            </Box>

            <Box sx={{ mt: 4, p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
              <Typography variant="body2" color="info.dark">
                Settings customization will be available in a future update. Current values are
                defaults.
              </Typography>
            </Box>
          </Stack>
        </TabPanel>

        {/* Budget Goals Tab */}
        <TabPanel value={tabValue} index={1}>
          <GoalsList />
        </TabPanel>

        {/* Payment Methods Tab */}
        <TabPanel value={tabValue} index={2}>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <BankAccountList />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <PaymentCardList />
            </Grid>
          </Grid>
        </TabPanel>
      </Paper>
    </Container>
  );
}
