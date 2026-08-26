import { Router } from 'express';

import { submitContactForm, submitQuoteForm } from '../controllers/formController.js';
import { register, login, me } from '../controllers/authController.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.status(200).json({ success: true, message: 'Server is healthy' });
});

router.post('/contact', submitContactForm);
router.post('/quotes', submitQuoteForm);

router.post('/auth/register', register);
router.post('/auth/login', login);
router.get('/auth/me', me);

export default router;

