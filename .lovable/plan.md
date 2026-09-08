# Diagnóstico: excesso de mensagens no WhatsApp

Investiguei o código, o banco, os agendamentos e os dados reais. As causas foram confirmadas com consultas, não são suposições.

## O que está acontecendo hoje

**1. O Kiah cobra tarefas que você ainda nem aprovou.**
Existem 120 tarefas pendentes no banco e **nenhuma delas foi confirmada** na Caixa de Entrada. O robô de lembretes não olha esse campo: ele cobra tudo, inclusive o que ainda está esperando sua revisão. Como quase tudo que a triagem cria entra sem confirmação, praticamente todo item vira alerta.

**2. Tarefas velhas nunca param de cobrar.**
São 38 tarefas vencidas, a mais antiga de 19/08. Depois de vencer, a regra é "reavise a cada 30 minutos, no máximo 8 vezes". Só que o contador usado para esse limite é o de *adiamentos*, e ele nunca aumenta quando um alerta é enviado (está em 0 em todas). Ou seja: **o limite de 8 nunca é atingido e a cobrança é infinita**. Confirmei nos dados: dezenas de tarefas de agosto com último alerta às 18:50 de hoje.

**3. Volume potencial enorme.**
A verificação roda a cada 5 minutos e envia até 20 mensagens por rodada — teto de 240 mensagens por hora. Com 38 vencidas em cadência de 30 min, o normal é uma rajada de ~38 mensagens a cada meia hora, todo dia.

**4. Repetições reais no conteúdo.**
Há tarefas duplicadas em texto ("Criar material para as aulas do 8º M01 de Matemática", "Assinar documento", entre outras, cada uma duas vezes) — a mesma cobrança chega duas vezes porque são dois registros.

**5. Os comandos do WhatsApp estão quebrados (bug confirmado).**
"feito abc123", "adiar abc123 30", "desisto abc123" e "remarcar" buscam a tarefa comparando o identificador como se fosse texto. O banco rejeita essa comparação com erro — testei e o erro acontece. Resultado: **nenhum desses comandos jamais funcionou**; ou você recebe "não achei essa tarefa", ou nada acontece. Isso explica a bola de neve: você não consegue encerrar nada pelo WhatsApp, então tudo continua cobrando.
Além disso, **não existe comando "deletar"** — ele nunca foi implementado.
Terceiro detalhe: comandos só são aceitos quando a mensagem parte do próprio número cadastrado; qualquer outro caminho cai na triagem por IA em vez de executar o comando.

**6. Grupos.**
A regra de grupos está correta em princípio (só grupos aprovados são lidos), mas um grupo aprovado tem **toda** mensagem enviada para a IA, sem filtro de assunto e sem juntar mensagens — daí o ruído.

**7. Sugestões de material pedagógico.**
São tarefas acadêmicas com cadência de 30 min e sem qualquer noção de horário útil: cobram de madrugada, no fim de semana e em horário de aula.

## Política anti-spam proposta (para aprovar antes de implementar)

**Regra de ouro: no máximo 6 mensagens do Kiah por dia, em horários definidos.**

Janelas fixas de envio (horário de Brasília):
- 07:30 — resumo da manhã: o que vence hoje + o que está atrasado (uma única mensagem consolidada).
- 12:30 — checagem do meio-dia, só se houver algo urgente ainda em aberto.
- 18:30 — resumo da noite: o que ficou pendente + o que vence amanhã.
- Fora dessas janelas, só passa tarefa marcada como urgente, e no máximo 3 por dia.
- Silêncio total das 21:00 às 07:00 e nada de cobrança de rotina em fins de semana.

Regras de conteúdo:
- **Nada sai sem confirmação.** Só tarefa aprovada na Caixa de Entrada pode gerar mensagem.
- **Uma mensagem, várias tarefas.** Consolidar por tema (Acadêmico, Casa, Compras, Outros) numa lista única em vez de uma mensagem por item.
- **Cobrança que se esgota.** Cada tarefa tem um contador próprio de alertas: no máximo 3 lembretes depois de vencer; depois disso ela vai para "esquecida" e só aparece no app até você reativar.
- **Nada de fósseis.** Tarefa vencida há mais de 7 dias sai da cobrança automática e entra num aviso semanal do tipo "você tem 24 pendências antigas — quer arquivar?".
- **Antes de vencer:** um aviso 24h antes e um na manhã do dia. Mantém o comportamento atual, que está correto.
- **Sem duplicatas.** Detectar tarefas com descrição e prazo iguais e juntá-las.

Regras de grupos e conversas:
- Grupo aprovado passa a ter **filtro por tema** (palavras/assuntos que você define, ex.: "prova", "material", "reunião"). O resto é descartado sem ir para a IA.
- Conversas diretas continuam com o acúmulo de 5 minutos, mas o resultado entra na Caixa de Entrada em silêncio — o WhatsApp só é usado nos resumos das janelas.

Correção dos comandos:
- Consertar a busca por identificador (a causa do erro), fazendo "feito", "adiar", "desisto" e "remarcar" voltarem a funcionar.
- Criar "deletar <id>", "deletar tudo" e "silenciar <id>".
- Criar "pausar" (para o Kiah parar de mandar mensagens até você dizer "voltar").
- Aceitar comando também quando a mensagem chega por outros caminhos do mesmo número.

Limpeza de dados (uma vez):
- Marcar as 38 vencidas antigas como arquivadas em vez de pendentes.
- Juntar as 6 duplicatas identificadas.

## Detalhes técnicos

- `src/routes/api/public/alertas-persistentes.ts`: não filtra `confirmado = true`; usa `t.adiamentos` como contador de alertas mas nunca o incrementa (o incremento só ocorre no comando "adiar"); `MAX_POR_EXECUCAO = 20` a cada 5 min; sem janela horária; sem consolidação por usuário.
- `src/routes/api/public/evolution-webhook.ts`: `.like("id", "prefixo%")` sobre coluna `uuid` → `42883: operator does not exist: uuid ~~ unknown`. Precisa de coluna gerada `id_curto text` (ou RPC com `id::text like ...`) — reproduzido via consulta direta. Sem comando `deletar`. Comandos gated por `remetenteEhNumeroCadastrado`.
- Cron ativo: `kiah-alertas-persistentes` `*/5 * * * *` apontando para a URL **-dev** (preview), não a publicada — vale revisar; e `kiah-limpar-itens-grupo-expirados` de hora em hora.
- Novas colunas sugeridas em `tarefas`: `alertas_enviados int`, `arquivada_em timestamptz`, `silenciada_ate timestamptz`. Nova tabela `kiah_envios_log` (user_id, enviado_em, tipo) para o teto diário, e `preferencias_alerta` (janelas, temas, quiet hours) por usuário.
- Grupos: adicionar `temas text[]` em `grupos_whatsapp` e filtrar por palavra-chave antes de chamar a IA (também reduz custo de triagem).

Nada foi alterado ainda — aprove e eu implemento em etapas, começando pelo conserto dos comandos e pelo corte imediato do volume.
