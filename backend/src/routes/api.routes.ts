import { Router } from 'express';
import {
  ingestLead,
  logLeadActivity,
  updateLeadStatus
} from '../controllers/intake.controller';
import { ingestMakeReportingEvent } from '../controllers/make.controller';
import { getDashboardSummary, streamDashboardSummary } from '../controllers/report.controller';

const router = Router();

router.get('/dashboard/summary', getDashboardSummary);
router.get('/dashboard/stream', streamDashboardSummary);
router.post('/make/reporting-events', ingestMakeReportingEvent);
router.post('/leads/ingest', ingestLead);
router.post('/leads/activity', logLeadActivity);
router.post('/leads/status', updateLeadStatus);

export default router;
