# Roadmap — Anti-spam WhatsApp do Kiah

- [ ] Migração: colunas de controle em `tarefas`, `temas` em `grupos_whatsapp`, tabelas `preferencias_alerta` e `kiah_envios_log`
- [ ] Corte do spam no cron de alertas (confirmado=true, janelas, limites, consolidação)
- [ ] Comandos do WhatsApp: resolução de id curto sem LIKE em uuid, novos comandos, comandos sem id
- [ ] Roteamento do dono vs instância vs terceiro no webhook
- [ ] Grupos: filtro por temas antes da IA, tarefa sem repetição
- [ ] Triagem: prompt anti-sobreclassificação, subtipo sugestao_material, dedupe semântico
- [ ] UI: seção Alertas do WhatsApp no perfil + edição de temas por grupo
- [ ] Cron: apontar para produção, cadência */15
- [ ] Deduplicação dos registros existentes (marcar descartada, sem apagar)
- [ ] Validações finais
