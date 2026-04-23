// Config mutavel do servidor. COURSES_PATH pode ser trocado em runtime via
// POST /api/config/courses-path — por isso expomos getter/setter em vez de
// constante. Rotas devem chamar getCoursesPath() a cada request.

let _coursesPath = process.env.COURSES_PATH || '/mnt/nvme2/kadabra/Downloads/cursos/';

export const getCoursesPath = () => _coursesPath;

export const setCoursesPath = (p) => {
  _coursesPath = p.endsWith('/') ? p : p + '/';
  return _coursesPath;
};
