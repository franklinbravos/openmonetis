-- Índice composto user_id + role em pagadores para acelerar getAdminPayerId.
CREATE INDEX IF NOT EXISTS "pagadores_user_id_role_idx"
  ON public."pagadores" USING btree ("user_id", "role");
