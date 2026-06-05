-- Etapa 2 — backfill: associa todas as linhas existentes ao unico usuario
-- atual (jonathandrumbass@gmail.com, criado em auth.users com UUID
-- 24a10e89-dbdf-4bc8-b039-f404e37ae4ac).
-- Idempotente: WHERE user_id IS NULL evita reescrever em re-execucao.

UPDATE lesson_progress
   SET user_id = '24a10e89-dbdf-4bc8-b039-f404e37ae4ac'
 WHERE user_id IS NULL;

UPDATE step_completions
   SET user_id = '24a10e89-dbdf-4bc8-b039-f404e37ae4ac'
 WHERE user_id IS NULL;

UPDATE personal_notes
   SET user_id = '24a10e89-dbdf-4bc8-b039-f404e37ae4ac'
 WHERE user_id IS NULL;

UPDATE pomodoro_sessions
   SET user_id = '24a10e89-dbdf-4bc8-b039-f404e37ae4ac'
 WHERE user_id IS NULL;

UPDATE weekly_diaries
   SET user_id = '24a10e89-dbdf-4bc8-b039-f404e37ae4ac'
 WHERE user_id IS NULL;

UPDATE flashcard_decks
   SET user_id = '24a10e89-dbdf-4bc8-b039-f404e37ae4ac'
 WHERE user_id IS NULL;

-- flashcards.user_id e' redundante com flashcard_decks.user_id (denormalizado
-- pra defesa em profundidade nas policies RLS). Puxa do deck pra coerencia.
UPDATE flashcards f
   SET user_id = d.user_id
  FROM flashcard_decks d
 WHERE f.deck_id = d.id
   AND f.user_id IS NULL;

UPDATE flashcard_reviews fr
   SET user_id = f.user_id
  FROM flashcards f
 WHERE fr.card_id = f.id
   AND fr.user_id IS NULL;

UPDATE flashcard_review_log frl
   SET user_id = f.user_id
  FROM flashcards f
 WHERE frl.card_id = f.id
   AND frl.user_id IS NULL;

UPDATE quiz_attempts
   SET user_id = '24a10e89-dbdf-4bc8-b039-f404e37ae4ac'
 WHERE user_id IS NULL;

UPDATE lesson_chats
   SET user_id = '24a10e89-dbdf-4bc8-b039-f404e37ae4ac'
 WHERE user_id IS NULL;

UPDATE prequestion_attempts
   SET user_id = '24a10e89-dbdf-4bc8-b039-f404e37ae4ac'
 WHERE user_id IS NULL;

UPDATE view_sessions
   SET user_id = '24a10e89-dbdf-4bc8-b039-f404e37ae4ac'
 WHERE user_id IS NULL;

UPDATE technical_diary_notes
   SET user_id = '24a10e89-dbdf-4bc8-b039-f404e37ae4ac'
 WHERE user_id IS NULL;
