-- Adiciona 'narracao' ao CHECK constraint de lesson_materials.kind.
-- A narracao "read-along" e' um JSON { audio, segments, voice, duration }
-- (audio = caminho relativo a raiz do curso / fileId no Drive; o mp3 e' servido
-- por /cursos/). segments = [{ start, end }] na ordem dos blocos de texto.
ALTER TABLE lesson_materials
  DROP CONSTRAINT IF EXISTS lesson_materials_kind_check;

ALTER TABLE lesson_materials
  ADD CONSTRAINT lesson_materials_kind_check
  CHECK (kind IN ('resumo', 'quiz', 'exemplos', 'diario', 'piada', 'podcast', 'narracao'));
