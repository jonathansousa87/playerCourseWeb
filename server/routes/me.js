// Perfil do usuario logado (role/status). O frontend chama isso uma vez apos
// login pra decidir entre mostrar o app ou a tela de aprovacao pendente —
// req.userRole/req.userStatus ja vem resolvido pelo requireAuth.
import express from 'express';

const router = express.Router();

router.get('/api/me', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ email: req.userEmail, role: req.userRole, status: req.userStatus });
});

export default router;
