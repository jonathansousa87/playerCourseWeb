// Permissao de curso por usuario. Admin bypassa (ve tudo, nao consulta a
// tabela) — so usuario nao-admin e restrito ao que o admin liberou em
// course_access (db/migrations/015_course_access.sql).
import { query } from '../db/index.js';

export const allowedCourseTitles = async (userId) => {
  const { rows } = await query('SELECT course_title FROM course_access WHERE user_id = $1', [userId]);
  return new Set(rows.map((r) => r.course_title));
};

// true se o usuario pode ver este curso (admin sempre pode).
export const canAccessCourse = async (req, courseTitle) => {
  if (req.userRole === 'admin') return true;
  const allowed = await allowedCourseTitles(req.userId);
  return allowed.has(courseTitle);
};

// Middleware pra rotas com :course no path (ex.: materials.js) — bloqueia
// antes do handler se o usuario nao tem acesso aquele curso. lesson_materials
// e global (sem user_id), entao sem isso um usuario comum le/apaga material
// de qualquer curso, mesmo um que nunca apareceria pra ele em /api/courses.
export const requireCourseAccess = async (req, res, next) => {
  const raw = req.params.course;
  if (raw == null) return res.status(400).json({ error: 'courseTitle obrigatorio' });
  try {
    const courseTitle = decodeURIComponent(raw);
    const ok = await canAccessCourse(req, courseTitle);
    if (!ok) return res.status(403).json({ error: 'Sem permissao para acessar este curso.' });
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
