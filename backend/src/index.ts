import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRoutes from './routes/api.routes';
import { initializeMongo } from './lib/mongo';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/v1', apiRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'LeadOps Engine Running' });
});

initializeMongo()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Backend server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize MongoDB', error);
    process.exit(1);
  });
