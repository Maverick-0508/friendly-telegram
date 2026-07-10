import { Router } from 'express';

import { submitContactForm } from '../controllers/formController.js';
import { register, login, me } from '../controllers/authController.js';

const router = Router();

router.post('/contact', submitContactForm);

router.post('/auth/register', register);
router.post('/auth/login', login);
router.get('/auth/me', me);

export default router;
