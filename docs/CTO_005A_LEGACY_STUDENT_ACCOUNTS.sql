-- ==========================================================================
-- CTO-005A — LEGACY_STUDENT_MAPPING_REQUIRED : identification des comptes Auth
-- élèves sans mapping actif.
--
-- 100 % READ-ONLY (un seul SELECT). À exécuter séparément, à la demande, quand
-- le propriétaire veut savoir QUELS comptes examiner.
--
-- Le résultat contient des e-mails : il NE DOIT PAS être commité ni collé dans
-- GitHub / une PR / un ticket public.
--
-- Rappel factuel : une fiche `students` licenciée SANS mapping n'est pas un
-- compte cassé — c'est le cas normal d'un élève qui joue via sa classe. Seuls
-- les comptes Auth listés ici correspondent à un utilisateur réel qui se
-- connecte et reste fail-closed (CTO-003) faute de mapping.
--
-- Aucun backfill n'est proposé : rattacher un compte à un élève est une
-- décision humaine (le domaine de l'e-mail n'est pas une preuve d'identité).
-- ==========================================================================

SELECT u.id                                        AS auth_user_id,
       u.email                                     AS auth_email,
       split_part(u.email, '@', 1)                 AS access_code_suppose,
       to_jsonb(u) ->> 'created_at'                AS compte_cree_le,
       to_jsonb(u) ->> 'last_sign_in_at'           AS derniere_connexion,
       p.role                                      AS role_profil,
       s.id                                        AS eleve_candidat_id,
       s.first_name || ' ' || COALESCE(s.last_name, '') AS eleve_candidat_nom,
       s.class_id                                  AS eleve_candidat_classe,
       s.licensed                                  AS eleve_candidat_licencie,
       CASE
         WHEN s.id IS NULL THEN 'aucun élève ne porte ce code d''accès → vérifier manuellement (compte de test, élève supprimé, ou faute de frappe)'
         WHEN EXISTS (SELECT 1 FROM public.user_student_mapping m2
                       WHERE m2.student_id = s.id AND m2.active = true)
           THEN 'l''élève candidat est DÉJÀ rattaché à un autre compte → ne rien faire sans arbitrage humain'
         ELSE 'candidat plausible : mapping possible après confirmation humaine de l''identité'
       END                                         AS piste
  FROM auth.users u
  LEFT JOIN public.user_profiles p ON p.id = u.id
  LEFT JOIN public.students s
         ON upper(s.access_code) = upper(split_part(u.email, '@', 1))
 WHERE u.email LIKE '%@eleve.crazychrono.app'
   AND NOT EXISTS (SELECT 1 FROM public.user_student_mapping m
                    WHERE m.user_id = u.id AND m.active = true)
 ORDER BY u.email;
