-- Adiciona 'podcast' ao CHECK constraint de lesson_materials.kind.
-- O conteudo do podcast e' um JSON { audio, title, turns } (audio = caminho
-- relativo a raiz do curso; o mp3 fica no disco e e' servido por /cursos/).
ALTER TABLE lesson_materials
  DROP CONSTRAINT IF EXISTS lesson_materials_kind_check;

ALTER TABLE lesson_materials
  ADD CONSTRAINT lesson_materials_kind_check
  CHECK (kind IN ('resumo', 'quiz', 'exemplos', 'diario', 'piada', 'podcast'));
