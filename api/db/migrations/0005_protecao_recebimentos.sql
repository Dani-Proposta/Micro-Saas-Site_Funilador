BEGIN;

REVOKE UPDATE ON public.marcos_pagamentos
FROM funilador_runtime;

GRANT UPDATE (anulado_em, anulado_por)
ON public.marcos_pagamentos
TO funilador_runtime;

ALTER TABLE public.marcos_pagamentos
ADD CONSTRAINT marcos_pagamentos_valor_finito_check
CHECK (valor <> 'NaN'::numeric);

ALTER TABLE public.marcos_pagamentos
ADD CONSTRAINT marcos_pagamentos_anulacao_check
CHECK (
    anulado_por IS NULL
    OR anulado_em IS NOT NULL
);

INSERT INTO funilador_meta.schema_migrations
    (versao, arquivo, metodo)
VALUES
    ('0005', '0005_protecao_recebimentos.sql', 'migration');

COMMIT;