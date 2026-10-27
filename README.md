# Edukors Slides Editor

Editor desktop de apresentações em HTML. Cada slide é um pequeno documento HTML/CSS/JS; o resultado principal é um **único arquivo HTML** que abre offline em qualquer navegador atual. PDF e PPTX existem como exportações estáticas de apoio.

Estado: **MVP local para macOS (versão 0.2.1)**. Decisões de projeto, regras e pendências estão em `CLAUDE.md`.

O repositório traz também o **servidor das perguntas interativas** em [`server/poll/`](server/poll/README.md): PHP + MySQL, pronto para qualquer pessoa hospedar o seu e apontar o app para ele.

## Usar

O aplicativo empacotado fica em `release/Edukors Slides Editor.app`. Ele não exige Node, Python nem Chrome.

- Para abrir: dê duplo clique no `.app` (ou arraste-o para Aplicativos, se quiser). Ao abri-lo pela primeira vez, o macOS registra a associação com arquivos `.ESF`; a partir daí, um duplo clique num `.ESF` abre a apresentação com a pasta do arquivo como raiz.
- O app tem assinatura *ad hoc* (local), sem notarização. Numa outra máquina, o Gatekeeper pode bloqueá-lo até a assinatura de distribuição ser feita.

### Arquivo `.ESF`

Uma apresentação é **um único arquivo** `.ESF`, um ZIP padrão (como um PPTX):

```text
Minha apresentação.ESF
  manifest.json               ordem, metadados, referências, packageVersion
  masters/<id>/{master.html,theme.css}  layouts/<id>.html  slides/<id>/{content.html,style.css,behavior.js,static.html}
  images/  fonts/             só as imagens e fontes em uso (nomes por hash do conteúdo)
  ai/system-prompt.md         contexto da palestra (opcional)
  .edukors/ai/conversations.json   conversas do assistente (sem dados de conta)
```

Ao salvar, o pacote guarda só o que a apresentação usa: imagens e fontes que nenhum slide, base ou layout cita mais são descartadas, e arquivos deixados na área de trabalho (downloads, capturas, pesquisas e scripts do assistente) não entram no `.ESF`, para que ele fique o menor possível. Copie, mova, renomeie ou exclua só o arquivo; várias apresentações podem ficar na mesma pasta. Durante a edição, o app trabalha numa área interna (`userData/workspaces/`) e recompacta o arquivo ao salvar: um ZIP temporário ao lado do destino é conferido e só então substitui o original, que nunca é truncado. Alterações não salvas ficam num rascunho interno e são recuperadas após uma falha. Se o `.ESF` mudar ou sumir fora do app, ao salvar ele oferece **Salvar como** ou **reabrir a versão externa**. Pacotes inválidos, com caminhos inseguros, links simbólicos ou acima dos limites (20 000 arquivos, 512 MB por arquivo, 2 GB no total) são recusados.

### Edição no slide

O canvas funciona como no Google Slides. Objetos são textos, imagens e qualquer caixa visível (fundo, borda ou sombra, como os cartões). Contêineres de layout invisíveis são ignorados.
- **Selecionar:** clique num objeto. Arrastar a partir de uma área vazia desenha um retângulo que seleciona os objetos inteiramente dentro dele. Shift ou ⌘ + clique acrescentam ou removem objetos, e ⌘A seleciona todos. Tab / Shift+Tab percorrem os objetos; Esc limpa a seleção. A seleção múltipla tem um contorno conjunto e uma alça para movimentar o grupo.
- **Mover:** arrastar move todos os selecionados (num texto em edição, use o quadradinho no canto da seleção). Guias rosas encaixam bordas e centros aos outros objetos e ao slide. Durante o arraste, Shift restringe o movimento ao eixo predominante; Alt/Option suspende o encaixe. Esc cancela o gesto e restaura a posição e a seleção anteriores. As setas ajustam 1 px (Shift: 10 px), com um passo de desfazer por sequência.
- **Editar texto:** clicar num texto o edita ali mesmo. Dentro de um objeto (por exemplo, um cartão), o 1º clique seleciona o objeto e o 2º entra no texto; o duplo clique vai direto. Enter quebra a linha; Esc ou clicar fora conclui. A formatação existente (cores, negrito) é mantida.
- **Formatar objetos legados:** fonte, tamanho, cor, borda, fundo e sombra também estão disponíveis nos textos e objetos de apresentações antigas. A barra mostra os estilos do tema e as fontes incorporadas, sem exigir `data-manual`. Diagramas SVG são editados como imagens inteiras.
- **Redimensionar caixas:** textos e caixas visíveis possuem alças nos cantos e lados; o texto pode crescer ao quebrar linhas.
- **Redimensionar imagens:** selecione a imagem e arraste uma das quatro alças nos cantos. A proporção é preservada; Shift permite redimensionamento livre. Esc cancela e Desfazer reverte o gesto inteiro.
- **Excluir:** com o foco na lista de slides, Delete/Backspace excluem os slides selecionados (a lista não rola; a seleção passa ao slide seguinte). No canvas, excluem só os objetos selecionados, e durante a edição de um texto apagam texto. Também: menu Slides → Excluir ou botão Excluir da toolbar.
- **Desfazer e imagens:** cada gesto é um passo de desfazer. A imagem inserida ocupa o espaço de imagem vazio do layout ou, se não houver, entra solta no centro do slide.

Mudanças de código ficam com o assistente de IA.

### Slide mestre: bases e layouts

- **Novo slide:** o botão (ou ⇧⌘N) abre as miniaturas dos layouts; duplo clique ou **Inserir**.
- **Layout de cada slide:** todo slide usa um layout (nome no rodapé); clicar no nome, ou Slides → Alterar layout…, troca-o. Os textos vão para os campos do novo layout e os objetos inseridos à mão são mantidos; slides escritos livremente (sem campos) mantêm o conteúdo e só mudam de layout.
- **Slide mestre** (toolbar ou Apresentação → Slide mestre): duas abas, **Bases** (alternativas de visual) e **Layouts** (organizações de conteúdo compartilhadas). Layouts comuns seguem a base **ativa** (CSS e objetos atrás do conteúdo). Slides colados de outra apresentação mantêm uma cópia local da base e do layout de origem. O check abaixo da miniatura, ao lado do nome da base ("Usar esta base") aplica a base escolhida a todos os layouts, inclusive os importados. A toolbar acima das miniaturas oferece as ações da aba selecionada: criar, renomear (também por duplo clique no nome) e excluir. O mesmo ícone de novo slide cria bases, layouts e slides da apresentação. Sempre resta pelo menos uma base e um layout. Alterações, inserções e exclusões na base/layout se refletem nos slides que os usam. Texto personalizado e objetos próprios do slide não alteram a base nem outros slides.
- **Copiar/colar no slide mestre:** selecione uma base ou layout na aba correspondente para copiar, recortar ou duplicar o item inteiro. Colar um slide inteiro nesse modo cria um novo layout.
- **Copiar/colar:** slides levam o tema, a base, o layout, imagens e fontes incorporadas. Objetos copiados mantêm formatação, fontes incorporadas, fundos e animações; recebem novas identidades para não interferir nos objetos existentes. Trocar ou excluir um layout preserva textos sem campo de destino e objetos próprios.
- **Templates:** Arquivo → Salvar como template…; renomeie ou exclua na tela Nova apresentação.

### Exportações

O app pergunta onde gravar (por padrão, ao lado do `.ESF`, com o nome dele). Ao concluir, aparece o alerta “Exportado”.

**Apresentar** (no app) abre o slide selecionado só com navegação; as ferramentas de apresentação existem apenas no HTML exportado. Todos os controles e mensagens gerados no HTML exportado são em inglês, incluindo avisos, painel do apresentador, créditos e perguntas interativas. O conteúdo escrito nos slides mantém seu idioma.

Se o navegador detectar a preferência por movimento reduzido, a apresentação oferece **Enable animations** ou **Keep current setting** no HTML exportado (no app, os rótulos seguem o idioma da interface). Ativar restaura as animações CSS apenas naquela abertura, inclusive nos próximos slides, sem alterar o sistema ou o arquivo `.ESF`. Sem movimento reduzido, nenhum aviso aparece. O recurso vale para **Apresentar** e para novos HTMLs exportados; arquivos HTML antigos precisam ser exportados novamente.

Ao criar uma apresentação, escolha a pasta; o arquivo `.ESF` recebe o nome da apresentação (com sufixo `-2`, `-3`… se já existir).

| Formato | Conteúdo |
| --- | --- |
| HTML | Arquivo único, recursos incorporados e animações. Controles: barras pelos cantos (hot corners), trilha de pontos com prévia, caneta, destaque, texto, lente, lousa infinita com rolagem (trackpad/roda, setas, Espaço+arrastar ou arrastar o vazio com Mover; formas, setas, cores, mover, borracha, desfazer), painel do apresentador e tela cheia; posição e lousa ficam salvas no navegador. Sem comandos de edição. Slides comuns offline; perguntas interativas exigem internet e uma chave de apresentador. |
| PDF | Uma página por slide, no estado final, **como imagem** (texto não selecionável). |
| PPTX | Uma imagem por slide; não editável no PowerPoint. |

### Perguntas interativas

No slide desejado, use **Inserir → Pergunta interativa** (ou o ícone de gráfico na seção Inserir). Escolha múltipla escolha (2–5 alternativas), nuvem de palavras ou resposta aberta. A atividade ocupa a área do slide; reabra o mesmo comando para editá-la ou removê-la. A configuração fica salva no `.esf` e acompanha cópia, duplicação e desfazer/refazer.

As respostas passam por um **servidor de perguntas interativas**, um backend PHP + MySQL que qualquer pessoa pode hospedar. O código está em [`server/poll/`](server/poll/README.md), com o guia de instalação. Informe o endereço em **Configurações → Perguntas interativas**, que também testa a conexão; o serviço do Edukors fica em `https://edukors.org/poll`. O campo **vem em branco**: sem servidor, a exportação avisa e, no HTML, a pergunta mostra que falta configurá-lo, sem acessar a rede. Cada HTML exportado usa o servidor configurado no momento da exportação.

No HTML exportado, aberto por duplo clique, o QR Code aparece desfocado com um cadeado fechado. Ao clicar no **cadeado** pela primeira vez, o player pede a **chave do apresentador**, cadastrada no banco do servidor. Ela pode ser colada (botão de colar ou ⌘V/Ctrl+V) e o botão de olho mostra o que foi digitado. O servidor devolve uma sessão de **12 horas**, guardada no `localStorage` daquele navegador; a chave em si nunca é guardada. Depois disso o cadeado abre e o QR Code fica legível. Ele leva os alunos à página móvel do servidor (com o logotipo Edukors), onde escolhem A–E ou escrevem uma resposta; o enunciado e as alternativas ficam na projeção. O contador atualiza durante a coleta. Clique novamente no **cadeado** para encerrar; depois, use o **ícone de gráfico** para ver barras com percentuais, nuvem/lista de frequências ou comentários. O ícone **Nova rodada** abre outra sala. Um botão discreto no canto inferior esquerdo da pergunta baixa todas as respostas da sala em **CSV** (hora em UTC e resposta; na múltipla escolha, letra e texto da alternativa), sem identificar os participantes. Nas perguntas abertas e de nuvem de palavras, a pergunta fica à esquerda e o QR Code à direita. Se a sessão vencer ou a chave for revogada, o player avisa e pede a chave de novo.

Cada atividade/rodada usa uma sala independente, criada pelo servidor e ligada à chave de quem a criou. Voltar ao slide mantém os resultados apenas durante aquela execução; recarregar o HTML inicia outra execução, mas a sessão de 12 horas continua valendo. Ao sair de um slide aberto, o player tenta encerrar a coleta. Fechar abruptamente a janela não garante o fechamento da sala no servidor. Respostas, chaves e tokens não entram no `.esf` nem no HTML exportado. O servidor apaga salas e respostas após 30 dias.

O serviço retorna até 50 termos ou comentários; comentários de até três caracteres não aparecem, embora contem no total. Cada celular responde uma vez por sala, por um identificador aleatório do navegador, o que não comprova a identidade dos alunos. PDF, PPTX, editor e miniaturas mostram a pergunta estática, sem iniciar atividade. Slides comuns continuam funcionando offline.

Contrato da API, instalação e retenção de dados: [server/poll/README.md](server/poll/README.md).

### Assistente de IA

Usa o Claude Code CLI já instalado e autenticado. Em **Configurações → Contas de IA**, informe o executável (ex.: `~/.local/bin/claude`) e um diretório de configuração por conta (ex.: `~/.claude-A`, `~/.claude-B`). O app não guarda credenciais: a autenticação continua com a CLI (`CLAUDE_CONFIG_DIR`).

O agente tem as ferramentas do Claude Code no Terminal — Bash, leitura/criação/edição de arquivos, busca na web, leitura de páginas, subagentes — e mais duas do app: **captura de página** (PNG) e **download** de arquivos. Há só duas restrições: (1) ele lê e grava apenas na área de trabalho da apresentação (o conteúdo do `.ESF` extraído) e subpastas (os comandos rodam no sandbox do Claude Code, sem rede; a web passa pelas ferramentas próprias) e (2) só trabalha na apresentação. Quando algo é ambíguo, ele pergunta: as opções aparecem no chat e basta clicar (ou responder por escrito). Arquivos que ele salva (capturas, imagens baixadas, gráficos, pesquisas) ficam em pastas próprias, como `media/`, só enquanto a apresentação está aberta: no `.ESF` entram apenas as imagens e fontes importadas e usadas nos slides; os do app (`manifest.json`, `master/`, `layouts/`, `slides/`, `images/`, `fonts/`, `.edukors/`) só mudam pela resposta estruturada, que o app valida (estrutura, recursos incorporados e renderização dos slides alterados); se ela falhar, pede **uma** correção e, persistindo o erro, não aplica nada. Toda alteração aplicada pode ser desfeita.

O rodapé do assistente mostra quanto resta da janela de 5 horas da assinatura e o horário da próxima janela, a partir do `rate_limit_event` que o Claude Code emite a cada pedido (último valor guardado por conta). Antes do primeiro pedido aparece “não disponível”.

## Desenvolver

O `npm` do PATH desta máquina é incompatível com o Node instalado; os comandos abaixo chamam os scripts diretamente.

```sh
node node_modules/typescript/bin/tsc --noEmit   # typecheck
node scripts/build.mjs                          # dist/
node scripts/start.mjs                          # abre o app em desenvolvimento (dados em .local-data/)
node scripts/test.mjs                           # testes unitários e de integração (Node)
node scripts/e2e.mjs                            # fluxo completo na janela Electron
node scripts/test-canvas.mjs                    # regressões de interação e objetos legados
node scripts/perf.mjs                           # medição com 50 e 300 slides
node scripts/package-mac.mjs                    # gera .app e ZIP assinado em release/
node scripts/package-mac.mjs --version=0.2.1      # versão explícita, sem incremento automático
node scripts/e2e.mjs --poll-server              # servidor de perguntas real (PHP + MySQL local, banco descartável)
node scripts/sync-poll-server.mjs [--check]     # copia server/poll para a pasta publicada (padrão: ../_code/public_html/poll)
ESF_EXECUTABLE="$PWD/release/Edukors Slides Editor.app/Contents/MacOS/Edukors Slides Editor" node scripts/e2e.mjs
```

Os testes usam um CLI Claude **simulado**; nenhuma conta real é chamada. Saídas e dados de teste ficam em `test-results/` (`ESF_DATA_DIR` isola as preferências).

Dependências estão em `node_modules/`, restauradas offline por `scripts/bootstrap-offline.py` a partir dos caches locais (o registro npm não era acessível). Não há `package-lock.json`.

### Estrutura

| Caminho | Responsabilidade |
| --- | --- |
| `src/shared/model.ts` | Tipos, mestre em branco, leitura do formato antigo, validação |
| `src/shared/render.ts` | Documento isolado de cada slide e runtime de etapas |
| `src/shared/canvas.ts` | Seleção, edição e ciclo de vida dos gestos no canvas |
| `src/shared/geometry.ts` | Matrizes, encaixe e redimensionamento |
| `src/main/package.ts` | Formato ZIP do `.ESF`: leitura, validação, limites, extração e gravação atômica |
| `src/main/projects.ts` | Sessões (arquivo + área interna), salvar, conflitos, recuperação, confinamento de caminhos |
| `src/main/exports.ts` | Captura estática, PDF e PPTX |
| `src/main/ai.ts` | Provider Claude Code (perfis, streaming, sessões, cancelamento) |
| `src/main/index.ts` | Processo Electron: janela, menus, IPC, orquestração da IA |
| `src/ui/` | Interface React, catálogos `pt`/`en`/`es` |
| `src/shared/poll.ts` | Perguntas interativas: configuração, controlador da coleta e chave do apresentador |
| `server/poll/` | Servidor das perguntas interativas (PHP + MySQL, auto-hospedável); fonte única, copiada para o site por `sync-poll-server.mjs` |

As prévias do editor são carregadas pelo esquema interno `esf-frame:`, com CSP e origem próprias; assim, scripts de slides rodam fora do processo do editor e não acessam suas APIs.

## Limitações conhecidas

- Integração com uma conta Claude real ainda não exercitada (só CLI simulado).
- Abertura de `.ESF` pelo Finder (duplo clique com o app fechado/aberto) não testada automaticamente; o mesmo código foi testado por argumento de linha de comando.
- PPTX validado como ZIP/OOXML e pelo QuickLook do macOS; falta abrir no PowerPoint e no LibreOffice.
- HTML exportado testado no Chromium do Electron; falta a matriz Safari, Chrome, Firefox e Edge.
- Builds de Windows e Linux ainda não existem.
- O player usa fontes do sistema nos controles (sem Manrope).

## Licença

MIT — ver `LICENSE`. Vale também para o servidor em `server/poll/`.

## Contas e provedores de IA

Em **Configurações → Adicionar conta**, escolha Claude Code, Codex, Kimi, Kiro, OpenCode ou Antigravity, dê um nome e crie a conta. É possível repetir o provedor; cada conta nova recebe seu próprio diretório de autenticação. Perfis Claude existentes são preservados. Modelo e esforço são salvos por conta e a conta ativa pode ser escolhida no assistente.

Instale a CLI correspondente e use **Conectar**. O editor fornece o comando de login para executar no Terminal; **Avançado** permite escolher executável e diretório. Antigravity usa o servidor ACP oficial `agy_acp_server.par` com `localharness_external` na mesma pasta, e abre o login Google pelo editor. Consulte a [instalação usada pelo T3 Code](https://github.com/pingdotgg/t3code/blob/main/docs/user/providers-antigravity.md). O executável `agy` convencional não substitui esse servidor.

Claude e Codex têm adaptadores próprios; Kimi, Kiro, OpenCode e Antigravity usam ACP. Os novos processos ficam confinados pelo sandbox do macOS. Credenciais não são gravadas no ESF. Descoberta de modelos depende do que cada CLI informa; também é possível informar um ID manualmente.

Validação: testes com CLIs simuladas cobrem protocolos, migração, isolamento de ambientes, retomada, cancelamento e falhas; o teste de interface cobre criação de várias contas, seleção e persistência após reiniciar. Não foram feitas chamadas pagas nem logins reais. O teste nativo de sandbox é ignorado quando o ambiente impede sandbox aninhado. O E2E geral dispõe de `--without-legacy-canvas` para excluir as antigas expectativas de edição de cards, incompatíveis com o bloqueio atual dos layouts.
