-- Adiciona 'piada' ao CHECK constraint de lesson_materials.kind
ALTER TABLE lesson_materials
  DROP CONSTRAINT IF EXISTS lesson_materials_kind_check;

ALTER TABLE lesson_materials
  ADD CONSTRAINT lesson_materials_kind_check
  CHECK (kind IN ('resumo', 'quiz', 'exemplos', 'diario', 'piada'));
