# Retomada da migração do Edukors Slides Editor

Documento consolidado para outra sessão/IA.

## 03/11/2026, 2ª rodada — Slides → Common (prevalece sobre o abaixo)

A pedido do usuário, o que o Slides tinha e serve a todos os apps foi para o Common (`c41ebf7`, push autorizado; lockfile do Slides aponta para ele): rascunhos e recuperação, conflito com alteração em disco, "Salvando…", alterações das conversas da IA, painéis lembrados, `maxOpenBytes` (Slides 1 GB, sem interceptar o diálogo), modo oculto `EDUKORS_HIDDEN`, `EdukorsMenus.pressIn`, Exportar sem arquivo salva antes, `EdukorsFiles.pickFiles` (inserir imagem/fonte). A galeria de templates ficou no Slides. Verificação: typecheck, `test.mjs` 56/56, headless, smoke 20/20 no `dist` e no `.app` do DMG; Common `node --test` 145. Instalada em `/Applications`. DMG SHA-256 `dd3e6f5ba3e75a10d03d75fc6fd439bdd083529417535df3dc69f744001643e4`. O Text Editor não foi testado com o Common novo. Slides sem commit.

## 03/11/2026 — v.26.11.03 (prevalece sobre o abaixo)

Itens "Common" pedidos pelo usuário, feitos no Common (`764bb21`, push na `main` autorizado) e o lockfile do Slides aponta para ele: barras laterais redimensionáveis, Exportar pergunta antes de substituir (só Cancelar/Substituir), indicador "Abrindo…" ao carregar arquivo. No Slides: repasse de cliques do canvas para os menus do Common fecharem; indicador também no PPTX/ESF > 50 MB. Guias nos cinco idiomas. Verificação: typecheck, `test.mjs` 56/56, headless, smoke 19/19 no `dist` e no `.app` do DMG; Common `node --test` 145. Instalada em `/Applications`. DMG `release/Edukors-Slides-Editor-26.11.3-mac-universal.dmg`, SHA-256 `29f0089bcd4bf4921d71ec2928b86fac11989d05589210983eb26d712b065e5a`, Developer ID, sem notarização. Slides sem commit.

## Estado ao encerrar — 02/11/2026, noite (prevalece sobre tudo abaixo)

O usuário parou por hoje. Nada foi commitado, publicado, enviado às lojas ou com tag. Detalhes técnicos e medições: `MIGRATION_STATUS.md`; regras para agentes: `CLAUDE.md` (seção "Migração para Edukors Common").

**Entregue e instalado:** v.26.11.02 (`package.json` 26.11.2) em `/Applications`, assinada com Developer ID, sem notarização. DMG `release/Edukors-Slides-Editor-26.11.2-mac-universal.dmg`, SHA-256 `7181136f1d64d7124b65b59c1cf65e46001dd611e80d9a90578600161f9774c1`. Cópias anteriores do app estão na Lixeira (1.3.0 e dois builds 26.11.2).

**Feito hoje, em ordem:**
1. Migração da interface para o Edukors Common (shell, abas, arquivos, IA, configurações, ajuda, termos, atualização), sem alterar o Common. Saída nativa só `.eslx`; `.esf`/`.pptx` abrem como importação.
2. Cinco idiomas (pt, en, es, zh, hi), com ajuda e termos.
3. Versão por data (v.YY.MM.DD).
4. PPTX acima de 50 MB abre (envoltório do diálogo de abrir no processo principal).
5. Exportar → PPTX editável (textos, imagens e formas nativos sobre imagem de fundo).
6. Controles do Common: barra de formatação, seletor de formas, menu de contexto (alinhar/distribuir com vários objetos), diálogos (inclusive Exportar pelo `exportAs`), botões e dicas; legado removido (backup em `migration-backups/retired-legacy-20261102-184546/`).
7. Remover avisos da importação; "Processando…" ao salvar; notas sem rótulo; opacidade; ordem e estilos sem recarregar.
8. Desempenho: imagens servidas pelo protocolo `esf-frame:` (uma cópia em cache) em vez de base64 por documento; frame novo montado atrás do atual (sem piscar); estado sem copiar dados das imagens; rascunhos empacotados no processo principal.
9. Textos dos layouts travados no slide (pedido explícito; muda a decisão 19).

**Verificação final:** typecheck; `node scripts/test.mjs` 56/56; `node scripts/test-common-headless.mjs` (inclui 7 testes de estado/IA); `node scripts/test-inheritance.mjs`; `node scripts/smoke-electron.mjs` 17/17 no `dist` e no `.app` do DMG (janelas ocultas, autorizado pelo usuário).

**Pendências para a próxima sessão:**
1. Retorno do usuário sobre a v.26.11.02 instalada: lentidão ao mover objetos não reproduzida (arraste sem tarefas longas no Electron); edição de texto ainda custa ~60 ms; pedir exemplo se persistir.
2. Abrir um PPTX exportado no PowerPoint (só validado por estrutura, Quick Look e reabertura no app); notas, animações, tabelas e rotação não vão para o PPTX.
3. Duplo clique no Finder em PPTX/ESF acima de 50 MB ainda esbarra no limite do Common (o Abrir funciona); PPTX grande aberto assim não entra em Recentes.
4. Portar os scripts antigos (`e2e.mjs`, `test-canvas`, `test-master-editor`, `perf`, `store-screenshots`, `test-poll`, `test-poll-live`, `test-eslx`); remover o `ProjectStore` sem uso e seus testes.
5. Notarização, pacotes Windows/Linux, Microsoft Store e App Store: só depois da homologação. Atualizar README, CHANGELOG (`## 26.11.2`) e capturas da Store antes de publicar.
6. Commit: o trabalho está todo no working tree (checkpoint em `migration-backups/checkpoint-20261102-noite/`). Commitar só quando o usuário pedir.

## Atualização — 02/11/2026, segunda sessão (prevalece sobre o histórico abaixo)

- **A interface de produção agora é a do Common.** O app empacotado roda o host do Common com as extensões do Slides; o shell React antigo e a IA legada saíram (backup em `migration-backups/retired-legacy-20261102-184546/`). Estado, verificações e pendências: `MIGRATION_STATUS.md`.
- **Cinco idiomas na interface** (pedido do usuário): pt, en, es, zh, hi. Ajuda e termos nos cinco. O HTML exportado continua em inglês.
- **Testes:** o usuário autorizou o Electron com janelas ocultas (`ESF_HIDDEN=1`, `scripts/smoke-electron.mjs`); nada pode aparecer na tela. Diálogos nativos (`confirm`, `alert`) aparecem mesmo com a janela oculta: usar diálogos da página. Chrome headless para o resto (`scripts/test-common-headless.mjs`).
- DMG de homologação: `release/Edukors-Slides-Editor-1.3.0-COMMON-TEST-mac-universal.dmg` (SHA-256 `4399af3b…931e`), assinado com Developer ID, sem notarização. Nenhuma publicação, tag ou envio às lojas.
- **Mudança de escopo pedida pelo usuário (02/11/2026)**: o Exportar → PPTX agora é editável (objetos nativos sobre fundo em imagem). Continua valendo: Salvar/Salvar como só `.eslx`.
- Os itens “Pendência imediata” e “Próximos passos 1–6” abaixo foram resolvidos nesta sessão, exceto a homologação pelo usuário e as lojas.

## Instruções e decisões definitivas

- Migrar para `edukors_common_ux`, usando `edukors_text_editor` como referência. Preservar todas as funcionalidades atuais.
- **Regra de ouro: várias entradas, somente uma saída nativa: `.eslx`.** ESF/ESF maiúsculo e PPTX são importações. Depois de carregar, o usuário edita a apresentação convertida e Salvar/Salvar como gravam somente ESLX. Nunca sobrescrever ESF/PPTX nem implementar escritor PPTX editável.
- O export legado de PPTX por imagens foi mantido como comando separado, assim como HTML/PDF. Ele deve proteger o original importado. Não confundir export com salvar documento.
- Entregar primeiro um DMG local isolado para o usuário testar. Somente depois da homologação avançar para publicação/lojas.
- O usuário confirmou que **App Store e Microsoft Store já aprovaram a versão anterior com IA**. Reutilizar identidade/configuração aprovada; não tratar IA como bloqueio presumido nem removê-la.
- **Não abrir telas ou janelas para testar.** Elas atrapalham o usuário. Usar testes Node e Chrome headless. Não rodar Electron, `npm start`, `npm run dev`, `dev:common`, testes de canvas/E2E/lojas ou outros programas com janela sem uma janela de teste acordada.
- Não reiniciar do zero, não descartar o working tree e não repetir investigação concluída. Há bastante código ainda sem commit.

## Situação real, sem superestimar o progresso

A migração está incompleta. A interface Common é uma entrada de integração separada; o produto de produção ainda usa `dist/main.cjs` e React antigo. Não existe DMG migrado. Não houve publicação nem submissão às lojas.

A regra de saída ESLX foi implementada também no backend atual, não apenas no protótipo. A importação PPTX é parcial e possui avisos persistentes; não está homologada como conversor de alta fidelidade.

## Repositórios e ambiente

- Workspace: `/Users/macstudiomgar/Library/CloudStorage/Dropbox/EDUKORS/edukors_slides_editor`.
- Baseline Slides: `ef06e9d667e34d024dfa049aebcb8a9535bc8059`, versão mantida em `1.3.0`.
- Common irmão e lockfile: `13a8d619f7f57494bfc1f4504d43be7b1140e42f`.
- Text Editor irmão: `24346f0759df53596f0afab5b35ef2d71ffba569`.
- Dependência Common via Git HTTPS `#main`, resolvida no lockfile. Não atualizar `main` inadvertidamente ao retomar.
- `.npmrc`: `allow-git=root`; parser XML direto fixado em `@xmldom/xmldom@0.8.15`.
- Node observado: 22.13.0; npm 12.0.2 avisou incompatibilidade com essa versão de Node. Não trocar versões/dependências às cegas.
- npm reportou 17 achados de auditoria (15 moderados, 2 altos); não foi executado `audit fix --force`.
- `.gitignore` já tinha modificação do usuário antes da execução. A linha que ignora `PLANO_MIGRACAO_COMMON_UX.md` foi preservada. Backups também estão ignorados.

## Mapa dos arquivos principais

| Área | Arquivos |
| --- | --- |
| Runtime Common no processo principal | `src/main/assistant.ts`, `index.ts`, `mcp.ts`; scripts/fakes migrados parcialmente |
| Regras de gravação/importação | `src/main/projects.ts`, `eslx.ts`, `file-policy.ts`, `package.ts` |
| Codec nativo sem filesystem | `src/shared/eslx.ts` |
| Leitura ESF e workspace legado | `src/shared/legacy.ts`, `src/main/package.ts`, `serialize` em `projects.ts` |
| Núcleo compartilhado de IA | `src/shared/assistant.ts`, `assistant-schema.ts`; reexportados pelo adaptador antigo |
| Mestres/layouts compartilhados | `src/shared/masters.ts`, `layout.ts` |
| Entrada Common separada | `desktop/common.mjs`, `common-preview.html`, `src/common/editor.ts`, `editor.css` |
| Estado/undo/revisões de documento Common | `src/common/document-state.ts` |
| Ferramentas de IA Common | `src/common/assistant-tools.ts` |
| Leitura de pacote Office | `src/shared/openxml.ts` — somente leitor; escritor OOXML removido após mudança de escopo |
| Importação PPTX parcial | `src/shared/pptx-import.ts` |
| Export PPTX raster existente | `src/shared/pptx-raster.ts`, wrapper em `src/main/exports.ts` |
| Relatório de importação | `ImportReport` em `src/shared/model.ts`; `src/ui/import-report.ts`, `.css`, traduções em `i18n.ts` |
| Testes novos | `tests/common-state.test.ts`, `openxml.test.ts`, `pptx-import.test.ts`, alterações em `core.test.ts` |
| Testes sem janela | `scripts/test-common-headless.mjs`, `import-save-headless.mjs`, `test-inheritance.mjs` |

## Detalhes para não perder na retomada

1. `ProjectStore.open` aceita ESF/ESLX/PPTX. ESF/PPTX produzem `path:''` e `sourcePath` informativo. Reabrir a mesma entrada reutiliza a sessão. `attach`, `create`, `writeDeck` e `writeEslx` exigem `.eslx`.
2. O escritor ESF foi removido de `src/main/package.ts`; o leitor continua. Os manifests ESF ainda existem no **workspace privado** porque as ferramentas antigas usam essa representação, mas isso não é gravação de apresentação ESF.
3. Primeira gravação usa workspace candidato e só troca a sessão após sucesso. Fontes e conversas legadas/nativas são preservadas no ESLX. Templates novos usam `template.eslx`; o catálogo lê `template.ESF` antigo como fallback.
4. ESLX v1 inicial guarda o Deck no JSON principal, com mídia binária em partes relacionadas. Ainda não foi dividido em uma parte por slide/base/layout como a proposta final do plano.
5. A IA Common usa workspace privado (sem `documentPath` na configuração). Ferramentas rejeitam revisão antiga e exclusão silenciosa de slides. Recursos adicionais/download/screenshot ainda não estão ligados nessa entrada.
6. Conversas legadas são preservadas integralmente em parte própria. Conversas nativas usam a serialização Common. O consumidor observa o painel para marcar dirty porque falta evento público de mudança de conversa no Common; avaliar uma extensão limpa depois.
7. A conversão PPTX atual importa texto/imagens/formas básicas, geometria e parte dos estilos; herança de masters/layouts/temas, grupos, recorte e objetos complexos precisam evoluir. Avisos são persistidos em `deck.importReport` e exibidos nas duas interfaces. Nunca anunciar suporte completo agora.
8. O Common preview abre ESF/PPTX por `importFormats` e **não declara `saveOriginal`/`saveExtensions`**. Seu formato nativo é `.eslx`.
9. O build principal possui plugin para resolver a versão do runtime Common no bundle. Sem isso, `createRequire(import.meta.url)("../../../package.json")` apontava para o lugar errado depois do bundling.
10. Não há commit desta implementação. Arquivos novos e modificados no disco são parte do trabalho, não sujeira a remover.

## Resultados e pendências de testes

- Última suíte Node: **77 testes, 77 aprovados**, após implementar saída nativa exclusiva e proteção de export. Typecheck e builds principal/Common passaram.
- O teste headless Common passou edição, negrito/alinhamento, histórico, comandos de slides, notas, bases/layouts, persistência de conversas/dirty e português antes da extensão dos testes de roteamento.
- A falha anterior do primeiro clique na barra lateral era de teste durante animação; aguardar `panel.getAnimations().map(animation => animation.finished)` resolveu, sem precisar adulterar o comando.
- **Pendência imediata:** o teste novo `scripts/import-save-headless.mjs` abriu ESF e fez dois saves ESLX, mas não abriu o diálogo no atalho Save As. O teste usa `Control+Shift+s`; o Common usa `EdukorsPlatform.mac ? event.metaKey : event.ctrlKey` em `src/shell/files.js`. Em Chrome headless no Mac, o modificador provavelmente deve ser Meta. Inspecionar e corrigir o teste segundo a plataforma, depois rerodar. Isso ainda NÃO foi corrigido nem validado.
- O teste de herança foi convertido de Electron para Chrome headless. Todas as asserções DOM e de aparência passaram. O último round trip falhou porque `writeDeck` remove recursos não usados por contrato. O script foi ajustado para usar diretamente `writeEslx`/`readEslx`, o codec sem essa coleta; **a correção ainda precisa ser rerodada**.
- E2E completo antigo falha em `card selected, not edited`; a mesma falha foi reproduzida no baseline restaurado. Antes da mudança de escopo, E2E com `--without-legacy-canvas` passou. O arquivo E2E foi atualizado para ESLX, mas não rerodado depois — não fazê-lo com janela enquanto o usuário trabalha.
- Scripts com Electron antigos nem todos têm bloqueio automático contra janelas; respeitar a preferência manualmente. Os novos smoke scripts Common/ESLX exigem `EDUKORS_ALLOW_VISIBLE_TESTS=1` e essa variável deve permanecer ausente.

## Comandos de retomada sem janelas

```sh
node scripts/test.mjs
node node_modules/typescript/bin/tsc --noEmit
node scripts/build.mjs --no-bump
node scripts/build-common.mjs
node scripts/test-common-headless.mjs
node scripts/test-inheritance.mjs
git diff --check
```

Os dois últimos testes de navegador usam **Chrome headless**, sem janela. No sandbox desta sessão precisaram de execução escalada para iniciar subprocessos, mas não de interação visual. Não usar `npm run build` sem `--no-bump`, pois o script incrementa a versão por padrão.

## Próximos passos em ordem

1. Corrigir o modificador de Save As no teste headless e concluir os fluxos ESF/PPTX → Salvar → Salvar como → ESLX. Rerodar a verificação de herança ajustada.
2. Revisar as mudanças atuais e fechar regressões. Não criar o DMG de homologação fingindo que a integração já está completa.
3. Completar a paridade Common (objetos/inserção/formatos, clipboard e multisseleção, enquetes, templates, ajuda, preferências, apresentação/exports, recuperação/conflitos/performance).
4. Qualificar a importação PPTX contra corpus real; manter avisos visíveis e entradas intactas. Nenhum trabalho de escritor PPTX editável ou saída ESF.
5. Remover consumidores/dependências legados de AI UI/AI CLI e validar pacote limpo sem repositórios irmãos.
6. Gerar DMG local de teste isolado, com identidade/dados próprios e sem atualização/publicação. Entregar hash e limitações. Aguardar homologação do usuário antes das lojas.
7. Prosseguir para os canais/lojas aprovados conforme o plano, preservando identidade e IA. Nada disso foi executado ainda.

## Backups e checkpoint desta sessão

Backups iniciais: `migration-backups/20261102-151924` (bundles, arquivos fonte, verificação de restauração, dados do app e cópias de recentes). Credenciais compartilhadas não foram copiadas em texto aberto. Falta uma segunda cópia independente/offline e preservar instaladores anteriores.

Checkpoint ao encerrar: `migration-backups/checkpoint-20261102-175928`. Contém patch Git, inventário do working tree, arquivo de fontes e checksums. Não contém node_modules, credenciais ou os dados privados do aplicativo. Os originais de trabalho permanecem no workspace.

## Inventário Git ao encerrar

```text
 M .gitignore
 M electron-builder.yml
 M package-lock.json
 M package.json
 M scripts/build.mjs
 M scripts/e2e.mjs
 M scripts/perf.mjs
 M scripts/store-sample.ts
 M scripts/store-screenshots.mjs
 M scripts/test-ai-ui.mjs
 M scripts/test-canvas.mjs
 M scripts/test-inheritance.mjs
 M scripts/test-master-editor.mjs
 M scripts/test.mjs
 M src/main/ai.ts
 M src/main/assistant.ts
 M src/main/exports.ts
 M src/main/index.ts
 M src/main/mcp.ts
 M src/main/package.ts
 M src/main/projects.ts
 M src/shared/canvas.ts
 M src/shared/edit.ts
 M src/shared/esf.schema.json
 M src/shared/model.ts
 M src/ui/App.tsx
 M src/ui/AssistantSettings.tsx
 M src/ui/i18n.ts
 M tests/core.test.ts
 M tests/perf-fixture.ts
 M tests/poll.test.ts
?? .npmrc
?? MIGRATION_STATUS.md
?? common-preview.html
?? desktop/
?? scripts/build-common.mjs
?? scripts/import-save-headless.mjs
?? scripts/test-common-headless.mjs
?? scripts/test-common.mjs
?? scripts/test-eslx.mjs
?? src/common/
?? src/main/eslx.ts
?? src/main/file-policy.ts
?? src/shared/assistant-schema.ts
?? src/shared/assistant.ts
?? src/shared/eslx.ts
?? src/shared/legacy.ts
?? src/shared/masters.ts
?? src/shared/openxml.ts
?? src/shared/pptx-import.ts
?? src/shared/pptx-raster.ts
?? src/ui/import-report.css
?? src/ui/import-report.ts
?? tests/common-state.test.ts
?? tests/import-save-fixture.ts
?? tests/openxml.test.ts
?? tests/pptx-import.test.ts
```

## Registro técnico anterior consolidado

# Migration checkpoint

## Current scope — authoritative

Multiple inputs, one native save format: **ESLX only**. ESF and PPTX are read-only imports. Save and Save As never write either source format. New templates are ESLX; existing ESF templates remain readable. Existing distribution exports are separate commands; no editable PPTX writer is planned.

## Implemented

- Source backups of all three repositories, verified bundles and restoration, plus installed templates/skills/workspaces/preferences and recent-document copies. Location: `migration-backups/20261102-151924`; manifests alongside archives. Shared credentials were not copied in plaintext. Independent/offline second copy and prior installers remain pending.
- Main-process AI uses Common runtime at locked commit `13a8d619f7f57494bfc1f4504d43be7b1140e42f`. Legacy UI packages remain until UI migration completes.
- Native ESLX codec, binary resources, complete legacy history and native Common conversation persistence. Native writers reject non-ESLX extensions. ProjectStore imports ESF/PPTX without assigning a writable source path; first save creates ESLX. Export protection prevents overwriting an imported source or native document.
- Separate Common integration entry: `desktop/common.mjs`, `common-preview.html`, `src/common/`. Shell, tabs, canvas editing, basic shared text formatting, slide actions/reorder, document-owned undo/redo, notes, base/layout operations, revision-checked AI tools and native conversation persistence are connected.
- PPTX import foundation validates OPC/XML/references and imports basic text/images/shapes. Unsupported objects and incomplete inheritance are reported. The import report is saved with the native document and rendered in both interfaces. This is **partial import support**, not final fidelity.
- Updated plan: `PLANO_MIGRACAO_COMMON_UX.md`.

## Verification

- Latest code suite: **77/77 passed**. Typecheck and production/Common builds passed; production version remains 1.3.0.
- Headless Common suite previously passed editing/formatting, slides/history, bases/layouts/notes, conversation dirty/persistence and Portuguese labels.
- New headless routing tests exercise ESF/PPTX Open → Save → Save As using an in-memory native-file host. Open and two saves advanced; the Save As keyboard shortcut did not open its dialog in this test. Investigate the shortcut/focus before marking routing verified.
- Original inheritance DOM/appearance assertions passed in headless Chrome. Its final package check initially exposed intentional unused-resource pruning in the template helper. It now targets the lossless ESLX codec directly; **rerun `node scripts/test-inheritance.mjs`** to verify that adjustment.
- Original full Electron E2E has a pre-existing canvas assertion failure (`card selected, not edited`), reproduced on the restored baseline. Earlier E2E with `--without-legacy-canvas` passed. E2E source expectations have been updated for ESLX, but it has not been rerun after the native-only scope change.

## Test preference

**No visible windows.** Run code/codec/filesystem tests and Chrome headless. New Electron smoke scripts require `EDUKORS_ALLOW_VISIBLE_TESTS=1`; do not enable it without an agreed visual-test window. `npm run test:common` now uses headless Chrome. Inheritance test was converted from Electron to headless Chrome.

## Remaining before the requested DMG

1. Finish/verify Save/Save As headless routing and import-report flows after the scope changes.
2. Complete Common UI parity: remaining object controls/insertion, clipboard/multiselection, polls, templates/help/preferences, presentation/export integration, recovery/conflicts and performance.
3. Improve and qualify PPTX import fidelity against a representative corpus; keep limitations explicit.
4. Remove legacy AI UI/runtime dependency consumers and validate clean packaging.
5. Build an isolated local DMG, verify package/signing as applicable, and provide its checksum and test notes. **No migrated DMG exists yet.**
6. User homologation precedes submissions; both App Store and Microsoft Store have an approved prior version with AI and must retain identity/features.

No stores have been submitted and no release has been published.


## Plano completo atualizado (referência)

As decisões de escopo no início deste documento e as instruções novas do usuário prevalecem sobre qualquer frase histórica. Segue o plano salvo, já revisado para saída única ESLX.

# Plano de migração do Edukors Slides Editor para Edukors Common UX

Data: 02/11/2026. Revisão 3: escopo atualizado — várias entradas, somente `.eslx` em Salvar/Salvar como. Base reavaliada contra Common `13a8d61` e Text Editor `24346f0`. Estado: em execução; progresso e evidências em `MIGRATION_STATUS.md`. DMG migrado e publicação ainda pendentes.

## 1. Resultado esperado e ordem de entrega

Migrar o editor para `edukors_common_ux`, remover a dependência direta de `edukors_ai_cli` e `@edukors/ai-ui`, preservar todas as funcionalidades atuais e acrescentar:

- Abrir `.esf`/`.ESF` como importação, editar a apresentação convertida e salvar exclusivamente em `.eslx`, mantendo o ESF original intacto.
- Criar, abrir, editar e salvar `.eslx`, o novo formato nativo.
- Abrir `.pptx` como importação, converter o conteúdo suportado para o modelo Slides e salvar exclusivamente em `.eslx`, mantendo o PowerPoint original intacto.
- Entregar primeiro um **DMG local de teste**, sem publicar releases nem enviar pacotes às lojas.
- Depois da homologação local, qualificar Windows e Linux, publicar pelos canais existentes e concluir as submissões às lojas viáveis.

**Regra de ouro confirmada pelo usuário:** várias portas de entrada, apenas uma de saída para documentos: `.eslx`. Salvar e Salvar como nunca gravam ESF nem PPTX, inclusive quando a apresentação veio desses formatos. Novos templates também são ESLX; templates ESF existentes continuam legíveis. Exportações de distribuição já existentes (HTML, PDF e PPTX por imagens) são comandos separados de Salvar e não constituem gravação no arquivo de origem.

A prioridade é preservar documentos, comportamento e segurança. Trocar somente extensões, transformar todo PPTX em imagens ou substituir o editor pelo documento de demonstração do Common não atende ao objetivo.

Sequência obrigatória: inventário → backup verificado → migração incremental → compatibilidade de arquivos → testes de paridade → DMG local → homologação do usuário → candidatos de distribuição → publicação e acompanhamento. Uma auditoria da configuração anteriormente aprovada nas lojas ocorre cedo, mas não publica nada.

## 2. Base examinada e limites da análise

| Repositório | Versão observada | Commit observado |
| --- | --- | --- |
| `edukors_slides_editor` | `1.3.0` | `ef06e9d667e34d024dfa049aebcb8a9535bc8059` |
| `edukors_common_ux` | `26.11.1` | `13a8d619f7f57494bfc1f4504d43be7b1140e42f` |
| `edukors_text_editor` | `26.11.2` | `24346f0759df53596f0afab5b35ef2d71ffba569` |

Na revisão inicial havia alterações locais no Common. Na revisão 2, o Common está com árvore limpa e os avanços estão commitados: abertura pelo sistema (`c25d3e3`), sidebar opcional e traduções de busca (`637c871`) e runtime independente (`13a8d61`). O Text Editor já registra o Common `13a8d61` no lockfile. Reexaminar o estado antes da implementação e arquivar qualquer alteração local posterior; os SHAs acima identificam a base desta revisão.

Arquivos de referência:

- Slides: `package.json`, `electron-builder.yml`, `src/shared/model.ts`, `src/shared/{canvas,render,player,poll,layout,edit,clipboard}.ts`, `src/main/{package,projects,exports,assistant,ai,mcp,index,preload}.ts`, `src/ui/`, `scripts/`, `tests/` e `.github/workflows/`.
- Common: `docs/{common-shell,document-package,ai}.md`, `src/package/package.js`, `src/ai/`, `src/shell/`, `src/format/`, `desktop/{host,files-core,updates}.mjs`.
- Text Editor: `app-config.js`, `document.js`, `assistant.js`, `desktop/main.mjs`, `tools/build.mjs`, configuração de pacote e release.

A análise é de código e documentação, não uma certificação do aplicativo. Os testes atuais não foram executados para elaborar este plano. Documentação do Common contém trechos históricos superados; o contrato efetivamente implementado e testes devem prevalecer.

### Constatações que mudam o projeto

1. O Slides usa Electron, React e TypeScript. O núcleo de slides trabalha com HTML/CSS/JavaScript, bases, layouts e recursos incorporados. Preservar esse núcleo durante a troca da interface.
2. O `.esf` atual é ZIP próprio, com `manifest.json`, `packageVersion=1`, `schemaVersion=3` e `runtimeVersion=1`; não é OPC.
3. O Common fornece ZIP/OPC e convenções `.eslx`, mas não um conversor PresentationML. OPC semelhante não implica equivalência entre HTML e PowerPoint.
4. O PPTX atual, em `src/main/exports.ts`, contém imagens dos slides; a importação dos objetos para edição nativa é uma frente nova; não haverá escritor PPTX editável.
5. Text Editor demonstra integração real: `startDesktopApp`, `EdukorsAppConfig`, `EdukorsAppDocument`, formatos originais e confirmação antes de regravar um formato com limitações. Seus conversores DOCX não servem como conversores PPTX.
6. Common tem runtime próprio e independente em `src/ai/runtime`, sem vínculo de instalação, importação ou manutenção com `edukors_ai_cli`. Sua API atual é `createAiRuntime`/`AiRuntime` e `AiError`/`isAiError`; a versão vem do package.json do Common. O trabalho é remover o uso legado ainda presente no Slides e consumir o host/UI Common. Os executáveis dos provedores Claude/Codex continuam sendo parte da experiência de IA; não são o pacote legado Edukors.
7. Common permite à IA trabalhar na pasta do documento salvo; Slides usa uma área de trabalho privada. Adotar o padrão novo sem adaptação ampliaria o acesso da IA. Preservar o confinamento atual por padrão.
8. Common limita conversas a 40 e itens a 400 por conversa. A migração não pode truncar silenciosamente históricos antigos.
9. O usuário confirmou que a App Store e a Microsoft Store já aprovaram a versão anterior com IA. Tratar a Mac App Store como canal com aprovação anterior e preservar essa base. O README local diz o contrário e a configuração examinada não contém target MAS: isso é uma divergência de documentação/checkout a reconciliar com o artefato e a configuração aprovados, não evidência de impedimento da IA. Também existem configurações para Microsoft Store, DMG/ZIP, NSIS, AppImage e DEB; Snap/Flathub não aparecem como canais existentes.
10. `.github/workflows/release.yml` pode chamar `store.yml` em versão final; `STORE_AUTO_SUBMIT=true` envia para certificação. Um draft no GitHub, sozinho, não impede esse caminho.

## 2.1 Reconsideração: reutilizar o que Common já entrega

A migração passa a ser integração de um consumidor real, seguindo o Text Editor, com extensões pequenas e identificadas no Common. Não reconstruir shell, contas, runtime, diálogos ou abertura pelo sistema dentro do Slides.

| Capacidade | Estado observado no Common | Trabalho no Slides / extensão necessária |
| --- | --- | --- |
| Runtime, host e UI de IA | Implementados e independentes do pacote legado | Configurar ferramentas/contexto de Slides; migrar testes e histórico |
| Duplo clique, Abrir com, argumentos, segunda instância | Host e preload implementados; eventos chegam às abas | Declarar extensões/associações e testar pacote real, inicialização fria e quente |
| Pasta mais recente | Persistida em `last-folder.json` | Reutilizar; migrar preferência antiga se aplicável |
| Abrir formatos de entrada | `openExtensions` e `importFile`; o Common pode oferecer regravação original para outros apps | Slides não registra `saveExtensions`/`file.saveOriginal`; ESF/PPTX entram como documentos não salvos, com origem somente informativa |
| Salvar como | Diálogo grava a extensão nativa única de `file.extension` | Reutilizar diretamente com `.eslx`; reforçar a mesma restrição no processo principal e na persistência |
| Exportar bytes | Host aceita lista fixa HTML/PDF/PNG/MD/TXT/DOCX | Acrescentar registro validado de formatos Slides; só listar `pptx` na configuração não funciona |
| Sidebar | Opcional por `sidebar: false` | Slides mantém sidebar para miniaturas/bases/layouts; não copiar `false` do Text Editor |
| Busca/substituição | Traduções no Common; comportamento implementado no editor de texto | Não presumir mecanismo de busca compartilhado nem adicionar requisito novo sem necessidade |
| Pacote OPC | Implementado em `src/package/package.js` | Schema ESLX e conversores continuam sendo de Slides |
| Escrita em temporário com sync/rename | Implementada em `files-core.mjs` | Complementar com fingerprint, validação pós-serialização, recuperação e filas do Slides |
| Isolamento de teste | `--data-dir` ajuda no desenvolvimento; limitações em pacote permanecem | Configurar explicitamente dados/contas separados no DMG beta |

O contrato de arquivos atual merece quatro correções antes de substituir `ProjectStore`:

1. O host permite regravar formato estrangeiro apenas em caminho presente em Recentes (lista de dez itens). Um documento aberto não pode perder permissão de salvar quando sai dessa lista. Introduzir autorização por sessão/documento aberto, separada de Recentes, e autorização explícita para novo destino.
2. `saveOriginal` muda o estado do documento antes de concluir a alternativa de salvar no formato nativo. Tornar a troca transacional para que cancelar/falhar preserve caminho, formato e estado anteriores. A confirmação deve acompanhar o relatório atual de perdas, e não apenas um booleano permanente.
3. O export atual sobrescreve o destino e o nome deriva da extensão. O PPTX por imagens continua separado e identificado como raster. Todo export deve impedir colisão com o caminho de origem ESF/PPTX e pedir outro destino se necessário. Não haverá modo PPTX editável.
4. A escrita atômica não fornece detecção de edição externa. A alternativa de `rename` após falha de hard link também precisa preservar a regra de não sobrescrever quando `replace=false`. Acrescentar testes de corrida e não substituir a proteção de conflitos do Slides por uma gravação simples.

**Decisão de arquitetura revisada:** usar Common como dono do shell e host; preservar o núcleo de Slides e introduzir extensões compartilhadas testadas para formatos, destinos e persistência. Não criar um fork privado do Common nem dois sistemas de sessão/arquivo concorrentes. A importação fiel de PPTX continua sendo uma frente nova; a evolução do Common reduz integração, mas não resolve conversão PresentationML.

## 3. Regras de preservação e aceite

- Nenhum arquivo original convertido é removido, renomeado ou substituído automaticamente.
- Nenhuma migração de preferências ou contas destrói o estado antigo. Migração deve ser idempotente, versionada e registrada.
- Nenhuma funcionalidade antiga pode desaparecer por não existir na demonstração do Common; criar ponto de extensão no Common ou manter implementação específica de Slides.
- Toda perda de conversão deve ser identificada antes da gravação, por slide/objeto, com escolha explícita; nunca anunciar compatibilidade perfeita com qualquer PPTX.
- Todos os canais publicados devem ter a matriz de paridade aprovada. Uma loja que exija retirar recursos permanece bloqueada até solução equivalente; não chamar uma versão reduzida de migração concluída.
- Testes e DMG inicial usam dados isolados, documentos de cópia e atualizador desabilitado. Não utilizar contas reais automaticamente.
- Sem tag final, push de release ou submissão antes de concluir a homologação do DMG.

## 4. Fase 0 — Inventário executável e prova de viabilidade

Entregáveis: `docs/migration/feature-matrix.md`, `format-matrix.md`, `risk-register.md` e corpus de arquivos de teste sem dados pessoais.

1. Inventariar comandos de menus, barra, atalhos, configurações, ferramentas de IA, comportamento de abertura e fechamento, modelos, exports e persistência. Cada item deve apontar para código, teste existente e evidência esperada.
2. Catalogar formatos ESF realmente presentes em fixtures e releases antigas. Não prometer ler versões que o leitor atual já rejeita; incluir migrações explícitas para versões históricas encontradas.
3. Executar baseline: typecheck, testes atuais, E2E, canvas, herança, editor de mestre, movimento e enquetes. Registrar falhas preexistentes e resolver qualquer falha que impeça medir paridade.
4. Medir abertura, troca de slide, digitação, arraste, salvar, exportar e memória com 50 e 300 slides, imagens e fontes reais. Guardar ambiente e resultados.
5. Provar integração mínima com Common mantendo um canvas real do Slides, um comando de edição e um undo. Confirmar foco, atalhos e ciclo de vida entre shell e React.
6. Fazer spike de PPTX com corpus do PowerPoint e LibreOffice: texto, imagem, forma, grupo, layout, tema, notas e objeto desconhecido. Escolher leitor/parser conforme fidelidade, licença, manutenção, segurança e custo de distribuição. A implementação não inclui regravação OOXML nem salvamento no formato original.
7. Localizar as versões aprovadas na App Store e na Microsoft Store, seus commits, artefatos, identidades, manifestos, entitlements/provisioning quando aplicáveis, pipelines e notas de revisão. Comparar a integração Common com essa base, testando IA, subprocessos, MCP, arquivos, fontes e scripts. Investigar diferenças introduzidas pela migração; não presumir que a IA já aprovada exige substituição ou remoção.

**Saída:** matriz aprovada como contrato de regressão e arquitetura viável para importar PPTX e salvar a conversão em ESLX; incertezas registradas com responsável e teste de resolução.

## 5. Fase 1 — Backup e restauração antes de qualquer migração

Responsável: implementação/release. Revisor: responsável pelo produto.

1. Encerrar gravações do editor e processos de build; registrar versões de Node/npm/Electron, sistema, arquitetura, HEAD, branches, tags e estado Git dos três repositórios.
2. Criar backup com timestamp fora da árvore de trabalho. O diretório irmão `migration-backups` é um candidato existente, mas a execução deve verificar acesso e espaço. Usar também uma segunda cópia independente do Dropbox.
3. Guardar `git bundle --all` por repositório e snapshot da árvore incluindo arquivos não rastreados necessários, patches staged/unstaged, lockfiles, configurações e scripts. Bundle sozinho não guarda alterações não commitadas.
4. Guardar artefatos atuais de instalação, checksums e identificação de release. Se não houver instalador reproduzível, reconstruí-lo em checkout separado com versão preservada e testar antes de migrar.
5. Mapear caminhos reais de `userData`, preferências, recents, modelos, recuperação, workspaces, skills e registro compartilhado EDUKORS. Fazer cópia consistente. Credenciais entram somente em backup privado cifrado com acesso restrito; nunca em Git, corpus, pacote de teste ou log.
6. Inventariar documentos de teste e arquivos do usuário a converter; trabalhar em cópias. Não presumir que copiar o repositório protege documentos externos.
7. Gerar manifesto SHA-256, quantidade e tamanho de arquivos; validar leitura integral dos backups.
8. Restaurar em diretório isolado: verificar Git, reconstruir versão antiga, abrir ESF, restaurar preferências de teste e exportar HTML. Registrar evidência. Só então marcar backup como concluído.
9. Criar branch de migração e checkout/worktree separado; preservar branch e instalador antigos. Não usar reset destrutivo nem mover dados originais.

**Saída:** `backup-manifest.json`, checksums, localização privada documentada e relatório de restauração. Não incluir segredos no relatório público.

## 6. Arquitetura de destino

### 6.1 Responsabilidades

| Camada | Dono | Estratégia |
| --- | --- | --- |
| Shell, abas, temas, preferências, diálogos, controles comuns, IA compartilhada | Common | Integrar pelas APIs públicas e propor extensões genéricas |
| Modelo de slides, canvas, seleção, gestos, bases/layouts, enquetes e player | Slides | Reutilizar primeiro; refatorar somente com testes de paridade |
| Sessão, histórico, recuperação e conflitos de apresentação | Slides + host Common | Um único controlador autoritativo; evitar dois ciclos de save/undo |
| ZIP/OPC | Common | Reutilizar camada de pacote; ampliar limites contratualmente quando necessário |
| Schemas `.eslx`, leitor ESF e importador PPTX | Slides | Leitores de entrada e escritor ESLX separados, versionados e testáveis sem UI |
| Instalação, assinatura, identidade e atualização | Repositório Slides | Preservar canais, identidade de produção e histórico de versão |

Implementar pontos de entrada equivalentes ao Text Editor: configuração da aplicação, adaptador de documento, configuração da IA, bootstrap desktop e bundle do editor. Nomes finais podem seguir a estrutura TypeScript existente; não reescrever tudo em JavaScript apenas para copiar a referência.

Montar React somente nas áreas específicas de Slides (canvas, miniaturas, bases/layouts e enquetes) enquanto Common administra o shell. Manter a sidebar habilitada e preenchê-la com navegação real de Slides; `sidebar: false` do Text Editor não se aplica aqui. Definir mount/unmount por documento, seleção, notificações de dirty, comandos e dispose. Não deixar listeners, IPC ou sessões de IA sobreviverem à aba fechada.

### 6.2 Dependência e reprodutibilidade

Adotar `edukors-common-ux: git+https://github.com/mgarlabx/edukors_common_ux.git#main`, conforme direção do Common e Text Editor, com `.npmrc` apropriado à versão de npm (`allow-git=root` quando aplicável). `npm link` somente no desenvolvimento.

Em cada candidato, resolver a última `main` uma única vez, registrar SHA exato e lockfile efetivo e usar **essa mesma resolução** em todos os jobs/plataformas. Nunca resolver `main` independentemente em cada job. A publicação promove os artefatos testados; não recompila silenciosamente com Common mais novo. Um novo SHA exige novo candidato e reteste. Reproduções/rollback usam o SHA arquivado.

Não depender de modificações locais não registradas para um release. Concluir e registrar alterações necessárias no Common antes de congelar o candidato; rodar testes do Common e regressão do Text Editor ao mudar contrato compartilhado.

Remover `@edukors/ai-cli` e `@edukors/ai-ui` de dependências, lockfile, imports, scripts de screenshots, testes/fakes e caminhos relativos ao repositório antigo. Verificar árvore de dependências e bundle. Referências históricas na documentação podem permanecer identificadas como tais.

### 6.3 Host, arquivos e segurança

O `startDesktopApp` observado aceita `documentExtensions`, `openExtensions`, `saveExtensions` e `exportFormats`. Configuração: nativo `.eslx`; abertura adicional `.esf`/`.pptx`; `file.importCommand: false`, com leitores em `file.importFormats`. Não declarar `saveExtensions` nem `file.saveOriginal`: nenhum formato de entrada é alvo de regravação. O roteamento do shell usa uma única extensão nativa: não classificar ESF como nativo adicional apenas para contornar limites de tamanho.

Implementar `EdukorsAppDocument.toBytes`, `fromBytes`, `adopt`, `importFile` e `exportFile`, com snapshot/revisão e `committed` onde aplicável. O evento `edukors:document-saved` deve atualizar apenas a revisão efetivamente persistida. Estender o contrato se necessário para garantir que qualquer caminho de gravação aceite somente ESLX.

Reutilizar APIs existentes e estender apenas as lacunas:

- Protocolo isolado dos slides e CSP equivalente a `esf-frame:`; scripts de slide nunca recebem o bridge privilegiado.
- Exportação HTML com player, captura do estado final e PDF/PPTX legados. O export genérico de uma página do Common não substitui esse pipeline.
- Escrita atômica, detecção de conflito, recuperação, filas de gravação, cancelamento e fechamento seguro.
- Abertura por diálogo/Recentes e eventos de sistema já fornecidos pelo Common: configurar e testar, sem reimplementar listeners. Distinguir soltar arquivo no ícone do app (host atual) de soltar dentro do canvas (comportamento específico, se suportado).
- IA em workspace privado por apresentação; acesso adicional a arquivos somente por operação explícita, sem ampliar para a pasta inteira por efeito colateral da migração.

IPC deve validar origem, esquema, tamanho e documento autorizado. Slides/PPTX são entradas não confiáveis: manter sandbox, context isolation e Node desativado no renderer; não buscar recursos externos ao abrir PPTX e não executar macros/OLE.

## 7. Fase 2 — Shell Common e paridade funcional

Migrar em blocos pequenos: bootstrap e abas com sidebar de Slides → contratos de arquivos/estado e export → formatação → preferências/ajuda → ferramentas de IA. Priorizar um fluxo vertical ESF → editar → salvar ESLX → reabrir, usando o Common real, antes de ampliar a implementação. Manter a versão antiga executável em checkout separado, sem dois shells disputando comandos na nova versão.

| Área a preservar | Critério de aceite |
| --- | --- |
| Slides | Criar, selecionar, duplicar, reordenar, excluir, títulos/notas e navegação com resultado equivalente |
| Canvas | Seleção, edição de texto rico, drag/resize, guias, snap, crop, zoom e cancelamento com Esc |
| Formatação | Fontes, tamanhos, cores, bordas, preenchimento, sombra, links, imagens, formas e ordem visual |
| Histórico | Um gesto ou transação de IA por undo; redo consistente; histórico isolado por documento |
| Bases/layouts | Herança, alternância da base ativa, edição de mestre e troca de layout preservando conteúdo |
| Recursos | Imagens/fontes incorporadas, modelos personalizados e coleta apenas de recursos realmente não usados |
| Persistência | Novo, abrir, salvar, salvar como, recents, dirty, conflitos externos, recuperação e sair/cancelar |
| Apresentação | Animações/passos, tela cheia, cantos ativos, trilha, caneta, marca-texto, lupa, texto, quadro infinito e painel do apresentador |
| Exportação | HTML autocontido offline, PDF e PPTX por imagem continuam disponíveis e corretamente nomeados |
| Enquetes | Múltipla escolha, nuvem, aberta, QR, resultados, CSV, configuração/teste do servidor e aviso quando ausente |
| IA | Contas compartilhadas, instruções globais/documento, modelos/esforço, histórico, anexos, MCP, skills, perguntas, parar, revisão e undo |
| Interface | Português/inglês/espanhol, tema, atalhos por sistema, ajuda, termos, foco e acessibilidade |
| Distribuição | Ícone, identidade, associações, atualização por canal e fechamento com alterações pendentes |

Completar a tabela com o inventário de código antes de implementar; esta lista não substitui a inspeção de cada comando. Limitações por plataforma já existentes da IA devem continuar explícitas.

### Migração da IA e preferências

Usar `EdukorsAiAssistant.configure` e os contratos do host Common como caminho normal, seguindo `assistant.js` do Text Editor. Não recriar um serviço de IA do Slides. Para código de adaptação/teste que precise da API Node, usar `createAiRuntime`, `AiError`, `isAiError` e o fake em `src/ai/runtime/testing`; os nomes `createAiCli`, `AiCliError` e o host stdio legado não fazem parte do contrato atual. O transporte de teste pode seguir `tests/ai/helpers.mjs`, que conecta o dispatcher diretamente.

Mapear as ferramentas de `src/main/ai.ts`, `assistant.ts` e `mcp.ts` para o contrato Common, incluindo pesquisa, captura de páginas e download de imagens quando oferecidos atualmente. Preservar validação, escopo e revisão, não apenas o chat visível.

Aplicar operações ao documento da conversa, mesmo quando outra aba está ativa. Associar chamada à revisão-base; alterações concorrentes devem ser reconciliadas ou rejeitadas sem sobrescrever edição manual. Stop encerra pendências sem desfazer mudanças já confirmadas.

Migrar históricos ESF para partes de conversa Common. Guardar integralmente o histórico legado excedente em uma parte de arquivo versionada e alcançável por relationship, com acesso de consulta/exportação, ou ampliar o contrato Common. Não aceitar truncamento como migração bem-sucedida. Não portar credenciais para documentos; resume IDs incompatíveis preservam histórico e iniciam sessão nova com mensagem clara.

Migrar preferências, modelos, instruções, servidor de enquetes, skills e recents mediante mapa explícito de chaves e tipos. Manter chave/arquivo de versão da migração e rollback. Testar compatibilidade das contas com outros apps sem remover/recriar o registro compartilhado.

## 8. Fase 3 — Arquivos ESF e ESLX

### 8.1 Comportamento de Abrir/Salvar

| Documento | Abrir | Salvar | Salvar como |
| --- | --- | --- | --- |
| Novo | Documento na memória | `.eslx` | `.eslx` |
| `.esf` / `.ESF` | Importar para documento sem destino salvo | Escolher destino `.eslx` na primeira vez | `.eslx` |
| `.pptx` | Importar conteúdo suportado para documento sem destino salvo | Escolher destino `.eslx` na primeira vez | `.eslx` |
| `.eslx` | Abrir pacote nativo | Atualizar o próprio ESLX, com proteção de conflitos | Outro `.eslx` |

O caminho de origem (`sourcePath`/`origin`) nunca é o alvo de gravação. A sessão importada mantém `path` vazio até o primeiro Save. Normalizar o nome escolhido para `.eslx`; validar a extensão novamente no host, ProjectStore e escritor nativo. Recusar tentativas diretas de escrever ESF/PPTX antes de tocar no disco. Não oferecer “Salvar no formato original” nem exportar ESF.

Salvar como deve trocar o destino da sessão somente depois de escrita validada. Falha ou cancelamento conserva destino, dirty, histórico e workspace. A conversão nunca remove ou modifica o arquivo original. A leitura de templates legados é preservada; a criação de templates usa `.eslx`.

### 8.2 Contrato ESLX v1

Especificar e testar `docs/formats/eslx-v1.md` antes de estabilizar o escritor:

```text
[Content_Types].xml
_rels/.rels
docProps/core.xml
docProps/app.xml
docProps/thumbnail.png                         # opcional
slides/presentation.json
slides/_rels/presentation.json.rels
slides/slides/slide<ID>.json
slides/slides/_rels/slide<ID>.json.rels
slides/slideMasters/master<ID>.json
slides/slideLayouts/layout<ID>.json
slides/theme/theme<ID>.json
slides/media/...
slides/fonts/...
slides/ai/conversations/<ID>.json
slides/legacy/...                             # histórico adicional, se necessário
slides/import/...                             # relatório de importação, se separado do conteúdo principal
```

Estrutura proposta, a consolidar com Common. Conteúdo próprio versionado, com dimensões, IDs estáveis, ordem, bases/layouts, notas, enquetes, HTML/CSS/script/staticHtml, metadados e instruções. Separar versão do pacote, versão do schema e runtime. Validar referências e rejeitar versão futura incompatível com mensagem sem regravar.

Recursos e subpartes são alcançados por relationships; partes preservadas não podem virar órfãs eliminadas pelo empacotador. Traduzir URLs internas do HTML/CSS para IDs/URLs resolvidas pelo adaptador, preservando comportamento. Não substituir HTML arbitrário por uma lista reduzida de formas.

ESF permite até 20.000 entradas e 2 GiB totais; Common documenta 5.000 e 1 GiB, além de nomes mais restritos. Há limites adicionais no host: 50 MiB para formatos estrangeiros, 512 MiB para documentos nativos e saída de arquivo, além do custo de carregar bytes completos em memória. ESF/PPTX acima de 50 MiB precisam de política de limites por formato validada no host; não basta ajustar o limite do ZIP. Testar esse descompasso: remapear nomes internos com mapa de referências, manter limites defensivos e ajustar capacidade do Common quando necessário para o corpus aceito hoje. Nunca entregar arquivo parcialmente convertido ou alegar sucesso quando um limite impediu preservar conteúdo.

### 8.3 Integridade

Leitura identifica conteúdo, estrutura e versão, não apenas extensão. Bloquear path traversal, nomes ambíguos, symlinks, ZIP bombs, CRC inválido, XML com DTD/entidades, relationships externos não autorizados e recursos ausentes.

Escrita: serializar snapshot consistente → temporário no mesmo volume → validar reabertura/schema/recursos → sincronizar → conferir novamente conflito externo → substituir atomicamente → atualizar fingerprint/dirty. Definir comportamento sob falha de energia, disco cheio, arquivo bloqueado, Dropbox sincronizando e remoção do destino. Evitar limpar dirty de alterações feitas depois do snapshot.

Recuperação deve incluir documentos nunca salvos, além dos já salvos; o código antigo descarta workspaces `untitled-` na limpeza. Não perpetuar essa lacuna ao anunciar recuperação completa. Testar recuperação após crash durante edição, gravação e IA.

## 9. Fase 4 — Importação PPTX para apresentação nativa ESLX

### 9.1 Fluxo e responsabilidade

Construir somente `PPTX → modelo Slides → ESLX`. O usuário edita a apresentação nativa convertida. O PPTX original permanece intacto e não vira destino de Save/Save As. Não implementar escritor PPTX editável nem round trip para PowerPoint.

A camada OPC lê estrutura, tipos de conteúdo e relationships; o importador Slides traduz PresentationML para o modelo HTML existente, incorporando recursos e validando o Deck. Conservar IDs de origem onde ajudarem a diagnosticar a conversão. Identificar limitações antes de o usuário confiar no resultado; manter um relatório de importação no documento ESLX.

### 9.2 Matriz de importação

| Conteúdo PPTX | Objetivo de importação |
| --- | --- |
| Dimensões, ordem, títulos e notas | Preservar informação; adaptar proporções com aviso quando o canvas nativo exigir |
| Texto, runs, parágrafos e listas | Texto nativo editável com fonte, tamanho, cor, estilo, alinhamento e links |
| Imagens | Incorporar os bytes suportados; preservar posição, escala, recorte, rotação, transparência e ordem conforme matriz validada |
| Formas/linhas e grupos | Traduzir geometria e transformações suportadas; identificar explicitamente aproximações |
| Tabelas | Converter estrutura e conteúdo suportados, com limites de edição documentados |
| Masters/layouts/temas | Resolver herança visual e mapear para bases/layouts nativos quando possível |
| Gráficos/SmartArt/equações/OLE | Não executar OLE; informar o que não pôde ser convertido e oferecer fallback explícito quando disponível |
| Transições/animações/áudio/vídeo | Informar diferenças entre PowerPoint e o player nativo; não prometer execução equivalente |
| Fontes incorporadas | Respeitar disponibilidade e restrições; informar substituições |
| Arquivos cifrados, inválidos ou macros | Recusa clara sem modificar a entrada; não ampliar suporte por extensão semelhante |

PPTM/PPSX/POTX não estão automaticamente no escopo. PPTX previamente exportado como imagens continua contendo imagens; o importador não recria texto por inferência. Não anunciar fidelidade completa com qualquer PowerPoint.

### 9.3 Integridade, relatório e testes

- Validar ZIP/XML/relationships e limites antes de adotar o documento; bloquear path traversal, DTD/entidades e referências internas ausentes.
- Não buscar imagens externas nem executar conteúdo incorporado. Informar recursos vinculados indisponíveis.
- Exibir limitações por slide/objeto e preservar o relatório no ESLX. Se a conversão exigir perda não aceita, permitir cancelar e manter a entrada intacta.
- Testar PPTX → importar → editar conteúdo nativo → salvar ESLX → reabrir, comparando texto, mídia, notas, geometria e avisos.
- Verificar ESF → importar → editar → salvar ESLX → reabrir com preservação integral das funções legadas.
- Verificar hashes dos ESF/PPTX de origem antes/depois; testar que nenhuma função de salvar aceita essas extensões, mesmo por chamada direta.
- Comparar o resultado importado com referências produzidas pelo PowerPoint/LibreOffice, sem exigir que o Slides produza um arquivo PowerPoint editável. Durante o trabalho, executar automação de navegador em headless; testes com janelas ficam para uma janela de homologação acordada.
- Manter o export PPTX legado por imagens claramente identificado e impedir que sobrescreva uma entrada PPTX.

**Saída:** importador com matriz real de suporte, corpus, relatório persistente e gravação exclusiva em ESLX. A primeira implementação parcial não deve ser apresentada como importador final homologado.

## 10. Fase 5 — Qualificação integrada

Reutilizar testes existentes, mudando seus adaptadores e fakes para Common. Não remover uma asserção de regressão só para fazer o teste passar. Adicionar testes para requisitos novos e falhas de alto impacto.

Suites mínimas:

1. Modelo, canvas, geometria, clipboard, herança e mestres; inspeção visual em telas/escala diferentes.
2. Arquivos: corpus ESF histórico, ESLX, PPTX, round trips e igualdade semântica dos recursos preservados.
3. Persistência: conflito externo, documento renomeado, disco cheio, permissão negada, gravações simultâneas, crash, recuperação e cancelamento.
4. IA: fake do Common, revisão, MCP, anexos, mudança de conta, stop, edição concorrente, duas abas e ausência de acesso indevido. Smoke real com conta de teste somente quando configurada para isso.
5. Exports: HTML sem rede, animações, player, PDF, importação PPTX e export raster; enquetes mockadas e servidor real isolado. Não alterar servidor de produção.
6. Segurança: ZIP/XML maliciosos, scripts sem bridge, links, navegação, arquivos grandes e workers canceláveis.
7. Instalação: pacote real sem node_modules de desenvolvimento, sem repositórios irmãos, sem ferramentas de desenvolvimento e sem fake provider exposto em produção.
8. Plataformas: macOS arm64 e x64; Windows x64; Linux x64. HTML exportado em Chromium, Safari, Firefox e Edge.
9. Desempenho: comparar baseline de 50/300 slides. Alvo inicial: sem piora acima de 15% nos tempos e 20% em memória nos mesmos fixtures, com medições repetidas; exceções exigem justificativa e aceite antes da publicação.

**Bloqueadores de release:** perda silenciosa, corrupção, escape de sandbox, crash recorrente, ausência de recurso legado, conversão PPTX que perde conteúdo sem aviso no corpus suportado, falha de upgrade/rollback ou instalador sem validação na plataforma alvo. Resultado esperado: zero bloqueadores e evidências ligadas ao commit/candidato exato.

## 11. Fase 6 — DMG local para teste do usuário, antes das lojas

Este é o primeiro marco de entrega utilizável. Um DMG técnico anterior pode servir a desenvolvimento, mas não substitui o DMG de homologação com ESF/ESLX/PPTX e paridade.

1. Gerar candidato com identificação beta, nome visual distinto, bundle ID de teste e userData separados. Não substituir o app atual em `/Applications`.
2. Corrigir isolamento de pacote: o host Common observado só redireciona parte do armazenamento com `--data-dir` quando não empacotado. Criar configuração explícita de canal de teste que isole também registro de IA, preferências e workspaces no app empacotado; verificar isso no teste.
3. Desabilitar auto-update e uploads nesse candidato. Manter associações de arquivos antigas por padrão; testar as novas em ambiente controlado sem tomar posse automática de PPTX.
4. Congelar SHAs, dependências e versão. Usar build sem incremento automático; o `build.mjs` atual incrementa patch se não receber opção apropriada.
5. Empacotar em staging fora do Dropbox, como já faz `scripts/package.mjs`, para evitar atributos estendidos que atrapalham assinatura. Copiar somente artefatos finais para `release/`.
6. Criar DMG arm64 para teste inicial se necessário; o candidato completo deve ser universal arm64+x64 e testado nas arquiteturas declaradas. Usar `--publish never`. Não executar workflow de release nem criar tag final.
7. Preferir Developer ID e notarização quando as credenciais estiverem disponíveis. Se o primeiro teste usar assinatura ad hoc, identificar expressamente essa condição; isso não atende ao aceite de distribuição pública. Não orientar desativar Gatekeeper globalmente.
8. Montar DMG, instalar em local separado, abrir e verificar assinatura/arquiteturas/conteúdo. Com notarização, validar ticket e avaliação do sistema (`codesign`, `spctl`, `stapler`, conforme artefato).
9. Rodar smoke no `.app` empacotado, não apenas no dev server: importar ESF/PPTX, editar a apresentação convertida, salvar somente ESLX e reabrir; confirmar que os originais não mudaram, exportar HTML/PDF, apresentar, desfazer, recuperar e testar IA.
10. Entregar DMG, SHA-256, versões/SHAs, roteiro de teste, limitações de PPTX, instruções de instalação paralela e retorno à versão antiga.

**Portão obrigatório:** usuário testa e aprova o candidato identificado pelo hash. Se houver correção, gerar e testar novo candidato. Nenhuma publicação de loja deve preceder essa aprovação.

## 12. Fase 7 — Distribuição e lojas

### 12.1 Preparação comum

Manter `org.edukors.slides`, nome de produção, identidade Microsoft e Store ID `9PHLLNHZW4Z2`, após confirmar contra consoles e pacotes instalados. Não copiar os placeholders do Text Editor. Não confundir o identificador lógico `slides` do Common com bundle ID e identidade Store.

Escolher versão final maior que a instalada em todos os canais. A referência usa versão por data; adotar essa convenção somente com mapeamento SemVer/MSIX definido, monotônico e testado, incluindo prereleases. Versão de app e schema são independentes.

Atualizar associações `.esf`, `.eslx` e `.pptx`, MIME/UTI e manifestos por plataforma. Declarar PPTX como formato público existente/importado, não como tipo de propriedade exclusiva Edukors.

Preservar NSIS, AppImage e DEB enquanto substitui a base. Inventariar como versões antigas consultam atualizações: o updater do Common não deve quebrar o upgrade desde `1.3.0`, os nomes de artefatos, feeds ou assinaturas. Testar antigo → novo em instalação limpa e com dados existentes; Store usa atualização da Store, sem updater concorrente.

CI: matriz de testes → resolução única de Common → builds → smoke de pacote → checksums/proveniência → ambiente protegido → promoção. Arquivar SBOM/licenças e configuração efetiva. Assinatura deve falhar fechada para release público: ausência de segredo não pode produzir versão pública ad hoc.

Separar job de build do job de publicação/submissão. Durante migração desabilitar o caminho automático `STORE_AUTO_SUBMIT` e impedir inclusive upload de draft antes do marco local. Depois habilitar somente com gate de homologação. Não depender apenas de convenção humana sobre nomes de tags.

Atualizar README, changelog, ajuda pt/en/es, política de privacidade, termos se aplicável, página de downloads, screenshots e descrição de formatos. Descrever limites reais de PPTX e requisitos de IA.

### 12.2 Microsoft Store — atualização da versão já aprovada com IA

**Premissa confirmada pelo usuário:** a versão anterior com IA já foi aprovada na Microsoft Store. Reutilizar a identidade, o empacotamento e a estratégia de distribuição dessa versão. Não tratar a IA como impedimento presumido nem exigir sua remoção ou substituição para migrar para Common.

1. Recuperar e arquivar versão/build aprovados, commit, pacote, manifesto, identidade/publisher, pipeline e notas de certificação. Validar permissões de Partner Center, versão e certificados necessários no ambiente de release, sem expor segredos. Comparar as mudanças do Common com essa base, especialmente runtime de IA, subprocessos, contas, workspaces e permissões.
2. Gerar AppX/MSIX do mesmo candidato, verificar manifesto e conteúdo. Não presumir validade apenas por renomear extensão; testar pacote final que será enviado.
3. Executar Windows App Certification Kit e instalação/upgrade/desinstalação em máquina/VM Windows limpa; testar associações, IA, fontes, documentos, sandbox e atualização.
4. Atualizar listing localizado, screenshots, privacidade, classificação e notas ao revisor. Usar dados fictícios.
5. Enviar como atualização do produto existente, mantendo Store ID e identidade, primeiro para draft/validação restrita disponível no Partner Center; revisar evidências e submeter para certificação após homologação do DMG local. Descrever as mudanças reais em relação à versão já aprovada com IA.
6. Acompanhar certificação, corrigir eventuais problemas concretos e verificar instalação e atualização a partir da Store, incluindo a IA. Upload concluído não significa publicação concluída. A aprovação anterior é a referência; a nova versão segue o processo de atualização e certificação sem presumir incompatibilidade da IA.

A documentação Microsoft descreve upload de pacotes e opções de submissão; revalidar exigências na execução: [submissão MSIX](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/create-app-submission) e [publicação de aplicativo Windows](https://learn.microsoft.com/windows/apps/package-and-deploy/publish-first-app).

### 12.3 macOS direto — obrigatório e já existente

Após aprovação do DMG local, produzir DMG/ZIP universais de produção assinados com Developer ID, notarizados e com ticket verificado. Validar em instalação limpa e upgrade do aplicativo antigo; publicar pelo canal existente somente os artefatos aprovados e seus metadados de atualização. A distribuição direta e a Mac App Store têm requisitos distintos: [distribuição macOS, Apple](https://developer.apple.com/macos/distribution).

### 12.4 Mac App Store — atualização da versão já aprovada com IA

**Premissa confirmada pelo usuário:** a versão anterior com IA já foi aprovada na App Store. O plano deve partir dessa implementação e preservar suas funcionalidades e estratégia de distribuição. Não há motivo demonstrado para exigir outro backend de IA como condição inicial da migração.

O checkout examinado não contém target MAS e seu README informa ausência na loja. Localizar a configuração efetivamente submetida e corrigir essa divergência documental antes do release. A ausência no checkout não invalida a aprovação informada.

1. Recuperar e arquivar versão/build aprovados, commit correspondente, bundle ID, registro no App Store Connect, entitlements, provisioning, assinatura, pipeline e notas relevantes da revisão. Acrescentá-los ao backup e à matriz de distribuição.
2. Reutilizar identidade e configuração aprovadas. Comparar somente as mudanças trazidas pelo Common: inicialização, runtime de IA, caminhos de contas/workspaces, subprocessos, permissões, rede, acesso a documentos e atualização. Preservar a IA existente e seu confinamento.
3. Restaurar/integrar o target de loja no pipeline atual a partir da configuração aprovada, mantendo-o separado do DMG. Validar os requisitos aplicáveis com o [guia MAS do Electron](https://github.com/electron/electron/blob/main/docs/tutorial/mac-app-store-submission-guide.md) e as [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), sem transformar regras genéricas em um bloqueio presumido ao produto já aprovado.
4. Depois do aceite do DMG local, testar o pacote de loja, instalação/upgrade desde a versão aprovada, IA, documentos, recuperação e arquivos ESF/ESLX/PPTX. Atualizar listing, privacidade, screenshots e notas de revisão descrevendo as mudanças reais.
5. Enviar como atualização do aplicativo existente, acompanhar revisão e verificar instalação/atualização pela loja. Manter o mecanismo de atualização apropriado ao canal.

A aprovação anterior é o precedente de implementação e distribuição; a nova versão ainda passa pelo processo de revisão. Somente uma incompatibilidade concreta introduzida pela migração deve abrir trabalho de adaptação. Não retirar a IA nem propor uma edição reduzida por hipótese.

### 12.5 Linux e lojas adicionais

Preservar AppImage e DEB, testar instalação, sandbox e dependências da IA. Snap/Flathub não são canais existentes nem consequência automática do build Linux. Se integrarem o escopo de “lojas”, abrir trilha específica: sandbox/portais, acesso a provedores externos, identidade, manifesto, revisão e atualização. Exigir a mesma paridade; não prometer aprovação nem remover recursos. Não há escopo móvel Android/iOS neste plano desktop.

## 13. Fase 8 — Publicação, monitoramento e rollback

Promover o candidato aprovado sem recompilar; se assinatura/empacotamento final alterar o artefato, repetir os testes de pacote e registrar o novo hash. Publicar primeiro em distribuição controlada quando o canal permitir, validar downloads/instalações e então ampliar. Não introduzir telemetria sem decisão explícita; usar testes, logs locais exportados voluntariamente e relatos de suporte.

Por 7–14 dias, acompanhar crashes, conflitos/recuperação, importação/exportação, IA, instalação e atualizações. Designar responsável por incidentes e manter instaladores antigos acessíveis.

Rollback:

- **Código:** checkout/tag do baseline ou último candidato estável, Common no SHA registrado e lockfile arquivado; reconstrução não busca `main` atual.
- **Aplicativo:** interromper promoção/atualização defeituosa conforme o canal; republicar correção com versão superior quando downgrade não for aceito pela Store. Não prometer reversão instantânea de revisão/instalação já distribuída.
- **Dados:** restaurar backup em cópia isolada, verificar e só depois trocar dados; nunca sobrescrever alterações do usuário feitas depois da migração. Preservar preferências e credenciais compartilhadas de outros apps.
- **Documentos:** originais ESF/PPTX ficam disponíveis. O editor antigo não entende ESLX; documentos novos precisam de uma versão nova funcional. Não haverá gravação/exportação ESF como alternativa de rollback. Não chamar rollback de completo sem resolver essa dependência.
- **Segurança:** se houver falha de isolamento, suspender o caminho afetado e distribuição até correção; não contornar sandbox para manter o cronograma.

## 14. Plano de execução e responsabilidades

Estimativas iniciais em semanas de trabalho de uma pessoa experiente, a recalibrar após spikes; não são prazos prometidos. Revisão das lojas é externa.

| Marco | Dependências | Esforço indicativo | Entregável / aprovação |
| --- | --- | --- | --- |
| M0 — inventário/spikes | Nenhuma | 1–2 | Matriz, baseline, viabilidade PPTX e configuração aprovada das lojas |
| M1 — backup restaurável | M0 | 2–3 dias | Backup verificado e restauração |
| M2 — shell/host Common | M1 | 1–2 + 1 para extensões de arquivos | Fluxo ESF → editar → ESLX, sidebar e host comuns; persistência segura |
| M3 — IA/preferências | M2 | 1–2 | Paridade e migração segura |
| M4 — ESF/ESLX | M2 | 1–2 | Round trips sem perda |
| M5 — Importação PPTX | Spike M0, M4 | 2–4+ | Importador, relatório e gravação ESLX; reestimar conforme corpus |
| M6 — regressão e DMG | M3–M5 | 1–2 | DMG local e aceite do usuário |
| M7 — canais existentes | M6 aprovado | 1–2 + revisão | DMG público, atualização App Store, Store Windows, NSIS/Linux |
| M8 — novas lojas | Viabilidade + M6 | Estimar após spike | Snap/Flathub, se incluídos, com paridade ou bloqueio explícito |

Reestimar M2 após validar as extensões da seção 2.1: abertura pelo sistema e runtime não serão reconstruídos. M3 e M4 podem evoluir de forma independente após estabilizar o host; PPTX é o maior risco e não deve ficar para investigação no fim. Esta tabela não autoriza execução paralela por agentes.

Implementação mantém código e testes; revisão técnica valida formato/segurança; responsável de release cuida de identidades, artefatos e consoles; usuário homologa o DMG e as decisões de produto. Uma pessoa pode acumular papéis, mas as evidências e portões permanecem separados.

## 15. Checklist de conclusão

- [ ] Backup íntegro e restauração comprovada, incluindo o SHA atual do Common e eventuais alterações locais posteriores.
- [ ] Funcionalidades atuais inventariadas e sem regressão na nova interface.
- [ ] Slides não depende do pacote/repositório AI CLI nem de AI UI antigos.
- [ ] Common integrado pelo contrato atual, com SHA/lockfile registrados; abertura por sistema, sidebar e runtime reutilizados.
- [ ] Gravação nativa exclusiva, proteção de origem nos exports, conflitos, limites de tamanho e cancelamento transacional testados; mudanças compartilhadas não regridem o Text Editor.
- [ ] ESF abre e preserva conteúdo; salvar como ESLX funciona sem alterar o original.
- [ ] ESLX salva/reabre recursos, scripts, enquetes, bases, layouts e histórico.
- [ ] ESF/PPTX entram como importações; Salvar/Salvar como aceitam somente ESLX; hashes das entradas permanecem iguais.
- [ ] PPTX converte conteúdo suportado para edição nativa e mantém relatório persistente de limitações.
- [ ] Novos templates são ESLX; templates ESF antigos continuam legíveis.
- [ ] HTML, PDF e PPTX raster antigos continuam disponíveis.
- [ ] Migração de contas/configurações é idempotente e não amplia o acesso da IA.
- [ ] Testes automatizados, segurança, visuais, performance e pacotes aprovados.
- [ ] DMG local entregue, isolado e aprovado pelo usuário antes de qualquer publicação.
- [ ] Upgrade desde a versão atual e rollback de app/dados/documentos demonstrados.
- [ ] App Store, Windows Store e demais canais existentes atualizados e instaláveis, com identidade e IA preservadas.
- [ ] Cada nova loja tem paridade comprovada e publicação concluída, ou bloqueio documentado para decisão; não marcar conclusão global com lojas pendentes.
- [ ] Documentação, ajuda, screenshots, privacidade, checksums e notas de versão atualizados.
- [ ] Período de acompanhamento concluído sem bloqueadores de integridade ou segurança.

