# Kiah Focus — primeira etapa de confiabilidade

A estrutura de tarefas, agenda, compras, caixa de entrada, histórico, confirmação e limites de alertas permanece a mesma. Esta etapa não altera nem remove registros do banco.

## Configuração antes de colocar em produção

1. Gerar dois segredos longos e distintos no gerenciador de ambiente da hospedagem: `KIAH_WEBHOOK_SECRET` e `KIAH_CRON_SECRET`. Não guardar os valores no repositório.
2. Configurar a Evolution para enviar `Authorization: Bearer <KIAH_WEBHOOK_SECRET>` ou `apikey: <KIAH_WEBHOOK_SECRET>` ao webhook. O campo `instance` do payload deve corresponder a `EVOLUTION_INSTANCE`.
3. Configurar o agendador existente para enviar `Authorization: Bearer <KIAH_CRON_SECRET>` ao endpoint de alertas, mantendo sua cadência atual.
4. Se a instalação da Evolution não oferecer cabeçalhos personalizados, usar um intermediário autenticado que os acrescente. Não reabrir o endpoint nem colocar o segredo na URL.
5. Verificar uma triagem no aplicativo autenticado e o cron com `{"simular":true}` antes de habilitar envios reais.

Sem os segredos, os endpoints retornam 401 e não executam ações. A implantação deve ser coordenada com os cabeçalhos para evitar interrupção de recebimento e alertas.

## Mudanças

- A triagem do navegador exige sessão e deriva o dono do token. Campos de integração enviados pelo navegador são substituídos pelo canal manual.
- Webhook e ciclo chamam um núcleo interno em módulo exclusivamente de servidor, sem depender de uma função RPC pública.
- Respostas da IA são validadas antes de gravar tarefas e compras; texto e mídia têm limites.
- Conversas cuja triagem falhe permanecem pendentes para a próxima varredura.
- Webhook valida a credencial e a instância antes de acessar banco ou chamar IA.

## Próximas etapas

O registro antecipado de deduplicação do webhook ainda precisa de fila durável com estados, reserva e retentativas; não prometer recuperação de toda mensagem recebida nesta etapa. Também faltam proteção contra ciclos simultâneos de envio, validação da posse do WhatsApp e restrição administrativa da reivindicação de registros órfãos. Esses itens antecedem a ampliação de autonomia.

O pacote npm e seu lockfile já estavam divergentes na base (`@lovable.dev/vite-tanstack-config`); resolver o gerenciamento de dependências em uma etapa própria.
