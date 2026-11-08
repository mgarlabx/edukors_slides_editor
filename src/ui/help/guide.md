# Guia do professor — Edukors Slides Editor

Este guia mostra como criar uma apresentação no Edukors Slides Editor, do primeiro slide até o arquivo pronto para apresentar. Você não precisa escrever HTML: tudo se faz no próprio slide e com o assistente de IA.

## 1. A ideia em uma frase

Uma apresentação é um conjunto de **slides**, cada um uma pequena página da web, que compartilham uma mesma aparência: a **base** (cores, fontes e o que fica atrás de todos os slides) e os **layouts** (a arrumação do conteúdo). O editor guarda tudo num arquivo `.eslx` e exporta **um único HTML** que abre em qualquer navegador, mesmo sem internet.

## 2. Instalar e abrir

**No Mac** (Apple Silicon ou Intel, macOS 13 ou mais recente):

1. Baixe o [`Edukors-Slides-Editor-mac.dmg`](https://github.com/mgarlabx/edukors_slides_editor/releases/latest/download/Edukors-Slides-Editor-mac.dmg), abra-o e arraste o app para a pasta **Aplicativos**.
2. Abra o app. Na primeira vez, o macOS pergunta se deseja abrir um app baixado da Internet: clique em **Abrir**.

**No Windows** (10 ou 11, 64 bits):

1. Abra a página do editor na Microsoft Store, [Edukors Slides Editor](https://apps.microsoft.com/detail/9PHLLNHZW4Z2), e clique em **Obter**. Sem aviso e sem senha de administrador.
2. O editor fica no menu Iniciar. As versões novas chegam pela Microsoft Store, como as de qualquer app instalado por ela.

Sem a Microsoft Store (alguns computadores de escola a têm desligada), use o instalador [`Edukors-Slides-Editor-windows.exe`](https://github.com/mgarlabx/edukors_slides_editor/releases/latest/download/Edukors-Slides-Editor-windows.exe). Se o navegador desconfiar do arquivo, escolha **Manter**; se o Windows mostrar **O Windows protegeu o computador**, clique em **Mais informações** e depois em **Executar assim mesmo**.

**No Linux** (64 bits, x64):

- No **Ubuntu, Debian, Mint** e derivados, baixe o [`Edukors-Slides-Editor-linux.deb`](https://github.com/mgarlabx/edukors_slides_editor/releases/latest/download/Edukors-Slides-Editor-linux.deb) e instale-o com dois cliques (ou `sudo apt install ./Edukors-Slides-Editor-linux.deb`). O editor fica no menu de aplicativos, e um `.eslx` abre nele com dois cliques.
- Em **outras distribuições**, baixe o [`Edukors-Slides-Editor-linux.AppImage`](https://github.com/mgarlabx/edukors_slides_editor/releases/latest/download/Edukors-Slides-Editor-linux.AppImage), marque-o como executável (`chmod +x`) e abra-o. Ele roda sem instalar.

Quando sai uma versão nova, o próprio editor avisa e oferece a página para baixá-la (na Microsoft Store, a atualização chega pela loja).

**Em todos os sistemas**, na primeira vez, o editor mostra os **Termos de uso** (a licença MIT, explicada): é preciso aceitá-los para continuar. Eles ficam depois na **Ajuda**, que também mostra a versão do editor. A partir daí você pode criar uma **Nova apresentação** ou **Abrir** um arquivo `.eslx`. Depois de instalado, um `.eslx` abre no editor com duplo clique.

**Arquivos de outras versões e do PowerPoint.** **Abrir** também aceita apresentações `.esf` (das versões anteriores do editor) e `.pptx` (PowerPoint). Elas abrem convertidas, numa aba sem arquivo: o original nunca é alterado, e **Salvar** pede um nome para gravar um `.eslx` novo. A conversão do PowerPoint traz textos, imagens e formas simples; o que não pôde ser convertido aparece num aviso no alto do slide, guardado com a apresentação.

## 3. A tela

| Parte | O que faz |
| --- | --- |
| **Barra de cima** | Arquivo (nova, abrir, recentes, salvar, exportar, mostrar na pasta), **Apresentar** e a troca entre **Slides** e **Slide mestre**, desfazer e refazer, edição (recortar, copiar, colar, duplicar, excluir), **Inserir** (texto, forma, imagem, link, pergunta interativa), Configurações e Ajuda. À direita, a lista de slides (⌥⌘0) e o **assistente de IA** (⇧⌘A). |
| **Abas** (logo abaixo) | Uma apresentação aberta por aba. O ponto na aba indica alterações não salvas; o **+** cria outra apresentação. |
| **Barra de formatação** | Fonte, tamanho, cor, negrito, itálico, sublinhado, linha, fundo, sombra e recorte do objeto selecionado no slide. |
| **Lista de slides** (esquerda) | As miniaturas, com uma barra para criar, mover, duplicar, copiar, recortar, colar e excluir slides. |
| **Slide** (centro) | O slide em edição; abaixo dele, as **notas do apresentador**. |
| **Assistente de IA** (direita) | A conversa com o agente que cria e altera os slides. |
| **Rodapé** | Se está salvo, o número do slide e o **layout** dele (clique para trocar), e a versão do editor. |

O tema (claro, escuro ou o do sistema), o tamanho das letras da interface e o idioma ficam em **Configurações → Aplicativo**.

A lista de slides e o assistente de IA mudam de largura: puxe a borda interna do painel (ou use as setas com ela em foco); um duplo clique na borda volta à largura padrão.

## 4. Criar uma apresentação, passo a passo

1. **Nova apresentação.** Clique no ícone de nova apresentação (ou tecle ⌘N) e escolha um modelo: *Blank presentation* (em branco) ou um dos seus templates. Duplo clique, ou **Criar**, abre a apresentação.
2. **Adicione slides.** O botão de novo slide, no alto da lista de slides (ou ⇧⌘N), mostra os layouts: escolha um com duplo clique ou **Inserir**.
3. **Escreva.** Clique num texto do slide para editá-lo ali mesmo.
4. **Peça ao assistente.** Abra o assistente (⇧⌘A) e descreva o que quer: "crie três slides sobre o ciclo da água para o 6º ano". Veja a seção 7.
5. **Salve** com ⌘S. Na primeira vez, o editor pergunta onde gravar e com que nome: a apresentação inteira fica num arquivo só, `minha-aula.eslx`, que você pode copiar, mover e renomear à vontade.

O arquivo guarda só o que a apresentação usa (imagens e fontes que nenhum slide cita saem ao salvar), por isso fica pequeno. Enquanto há alterações não salvas, o editor guarda um rascunho: se ele fechar de repente, na próxima abertura oferece **Recuperar**. Se o arquivo mudar fora do editor (outro programa, uma sincronização), ele pergunta antes de gravar por cima.

Para reaproveitar a aparência, abra a galeria de **Nova apresentação** com a apresentação aberta e use **Salvar como template**: o template aparece na galeria, onde também se renomeia e exclui.

## 5. Editar no slide

O slide funciona como no PowerPoint ou no Google Slides:

- **Selecionar.** Clique num objeto (texto, imagem, forma, link) para selecioná-lo; ⇧ ou ⌘ + clique acrescenta outro; arrastar a partir de um espaço vazio seleciona tudo o que ficar dentro do retângulo. ⌘A seleciona todos os objetos do slide. Tab percorre os objetos.
- **Mover.** Arraste o objeto (num texto, pela borda). Guias rosas mostram o alinhamento com bordas e centros; segure ⌥ para desligar o encaixe e ⇧ para mover num eixo só. As setas movem 1 px (⇧, 10 px).
- **Redimensionar.** Puxe as alças brancas; numa imagem a proporção se mantém (⇧ libera). ⌘ + setas também redimensionam. Com vários objetos selecionados, as alças do contorno do grupo redimensionam todos juntos.
- **Texto.** Clique dentro de um texto para editá-lo, mantendo a formatação. Selecione trechos para mudar fonte, tamanho ou cor na barra de formatação.
- **Imagens.** **Inserir → Imagem** cola a imagem copiada ou, se não houver uma, pede um arquivo; também dá para arrastar imagens do computador para o slide. Se o layout tiver um espaço de imagem vazio, ela vai para ele. O botão de recorte abre uma caixa com alças: Enter confirma, Esc cancela.
- **Formas e links.** A forma escolhida entra no slide com linha e fundo ajustáveis. O link usa o endereço copiado; a legenda substitui o endereço no slide, e a opção **QR code** põe o código ao lado.
- **Ordem e alinhamento.** O clique direito num objeto oferece **Trazer para frente**, **Enviar para o fundo** e, nos textos, o alinhamento horizontal e vertical.
- **Copiar entre slides e apresentações.** Objetos copiados (⌘C) colam (⌘V) em outro slide, mesmo de outra apresentação, com a mesma aparência e as animações.

Cada gesto é um passo do desfazer (⌘Z). Só Esc cancela um gesto em andamento.

**Os slides na lista.** Clique numa miniatura para ir ao slide; ⇧ e ⌘ selecionam vários. Com a lista em foco, ⌫ exclui os slides selecionados, ⌘D os duplica e ⌘C/⌘V os copiam (também para outra apresentação, que os recebe com a aparência dela). ⌘↑ e ⌘↓ mudam a ordem; Home e End vão ao primeiro e ao último. A última área clicada decide: depois de clicar no slide, ⌫ e ⌘D agem sobre os objetos, não sobre os slides.

## 6. Slide mestre: bases e layouts

**Slide mestre**, ao lado de Apresentar na barra de cima, troca a lista de slides por duas abas:

- **Bases.** Cada base é uma aparência alternativa da apresentação inteira: cores, fontes e os objetos que ficam atrás de todos os slides (um logotipo, uma faixa). A base selecionada no painel é a **ativa** (marcada com ✓ abaixo da miniatura) e vale para todos os slides. Assim você testa outra aparência sem mexer no conteúdo.
- **Layouts.** Cada layout é uma arrumação de conteúdo (capa, título e texto, duas colunas…), compartilhada por todas as bases. Um slide novo começa de um layout. O que vem do layout só se altera aqui, e a mudança chega a todos os slides que o usam; nos slides, só os textos e imagens dos espaços do layout se editam.

Renomeie com duplo clique no nome. A apresentação sempre fica com pelo menos uma base e um layout; os slides de um layout excluído passam ao anterior, com o conteúdo. Para **trocar o layout** de um slide, clique no nome do layout no rodapé: os textos vão para os campos de mesmo nome do novo layout.

Os detalhes de código (HTML e CSS das bases e layouts) ficam com o assistente: peça "deixe os títulos em azul-marinho em todos os slides" ou "crie um layout com imagem à esquerda e texto à direita".

## 7. O assistente de IA

O botão do assistente, na ponta direita da barra de cima (ou ⇧⌘A), abre e fecha o **assistente** ao lado do slide; fechar não interrompe nem apaga a conversa. Ele vê a apresentação e a altera a pedido: cria e reescreve slides, muda a aparência e traz imagens da web. Trabalha só na apresentação daquela conversa, numa pasta própria do editor (não na pasta do seu arquivo), e nunca exclui slides: isso fica com você.

**Antes de usar.** Instale no seu computador o [Claude Code](https://claude.com/claude-code) ou o [Codex](https://developers.openai.com/codex/cli/); o editor não os baixa. Depois, em **Configurações → Assistente de IA**, adicione uma conta e entre nela pelo navegador. A conta é sua, não do editor, e vale para os outros apps Edukors deste computador.

**Como pedir.** Escreva no campo de baixo e envie. Os slides selecionados vão junto com o pedido, por isso "este slide" quer dizer o slide selecionado; no Slide mestre, o assistente sabe qual base ou layout você está vendo. Exemplos:

- "Crie uma capa e três slides sobre frações para o 6º ano."
- "Reescreva este slide com frases mais curtas."
- "Faça uma animação que mostre as etapas uma de cada vez."
- "Traga uma foto do ciclo da água e coloque à direita."
- "Troque a fonte de toda a apresentação por uma mais legível."

O **+** do campo anexa arquivos (textos, PDFs, imagens), escolhe uma skill ou um servidor MCP e liga ou desliga a pesquisa na web. Quando o pedido tem mais de um caminho, ele pergunta com opções no próprio chat.

**Cada alteração é verificada e se desfaz.** O editor confere cada mudança que o assistente propõe; o que não passar volta para ele corrigir. Cada mudança aplicada é **um passo do desfazer** (⌘Z). No modo **revisar antes de aplicar**, você aprova cada mudança antes. O assistente não salva o arquivo: salve você, com ⌘S.

**Instruções permanentes.** As suas instruções para todas as apresentações ficam em **Configurações → Assistente de IA**, com os servidores MCP e as skills. O contexto desta palestra (público, objetivos, fontes) fica em **Configurações → Esta apresentação**, guardado no próprio `.eslx`.

**Modelo, esforço e consumo.** Ao lado de Enviar ficam o modo, o modelo e o **esforço** (mais esforço, respostas mais cuidadosas e mais lentas, com mais consumo). Abaixo, o uso da janela de 5 horas da assinatura.

**Conversas.** O histórico, no alto do painel, reabre conversas anteriores (com busca); a nova conversa começa outra. As conversas ficam guardadas na apresentação.

**Parar.** Enquanto o assistente trabalha, **Parar** interrompe o pedido; as mudanças que ele já aplicou ficam e se desfazem com ⌘Z.

## 8. Perguntas interativas

**Inserir → Pergunta interativa** transforma o slide numa pergunta ao vivo: **múltipla escolha**, **nuvem de palavras** ou **resposta aberta**. No HTML exportado, você desbloqueia a pergunta com a sua chave de apresentador, a plateia lê o QR code e responde pelo celular, e os resultados aparecem como barras, nuvem ou lista, com download em CSV.

As respostas passam por um servidor de perguntas que **você ou a sua instituição hospedam** (PHP e MySQL, com guia de instalação no [repositório](https://github.com/mgarlabx/edukors_slides_editor)). Informe o endereço em **Configurações → Perguntas interativas** e use **Testar conexão**. Sem servidor, a apresentação com perguntas não pode ser exportada em HTML: o diálogo de exportação mostra um aviso com o atalho para as configurações (PDF e PPTX continuam disponíveis).

## 9. Apresentar e exportar

**Apresentar** (⌘↵) mostra a apresentação a partir do slide selecionado, só com a navegação, para ensaiar.

**Exportar** (⌘E) gera:

| Formato | O que você recebe |
| --- | --- |
| **HTML** (recomendado) | Um arquivo só, com imagens, fontes e animações, que abre em qualquer navegador, mesmo sem internet (só as perguntas interativas usam a rede). |
| **PDF** | Uma página por slide, como imagem. |
| **PPTX** | Uma apresentação do PowerPoint editável: textos, imagens e formas viram objetos nativos (fonte, tamanho, cor, alinhamento, links); o que não tem equivalente (gradientes, decorações da base, desenhos livres) vai como imagem de fundo de cada slide. Animações e perguntas interativas não vão. |

O arquivo exportado fica ao lado da apresentação, com o mesmo nome; se já existir um arquivo com esse nome, o editor pergunta antes de substituí-lo.

**No HTML exportado**, as setas, a barra de espaço e Page Down/Up mudam de slide. Leve o mouse a um canto de cima para ver as ferramentas: **painel do apresentador** (abre noutra janela, com todos os slides e o atual em destaque), **caneta**, **marca-texto**, **texto**, **borracha**, **lente** de aumento, **lousa** infinita e **tela cheia**. Num canto de baixo aparece a trilha de slides, com prévia ao passar o mouse. Os controles do HTML ficam sempre em inglês, qualquer que seja o idioma do editor.

## 10. Atalhos

No Windows e no Linux, ⌘ corresponde a Ctrl, ⌥ a Alt e ⇧ a Shift.

| Atalho | Ação |
| --- | --- |
| ⌘N / ⌘O / ⌘S / ⇧⌘S | Nova, abrir, salvar, salvar como |
| ⌘W | Fechar a aba |
| ⌘1 … ⌘9 | Ir para a aba 1 … 9 |
| ⌘Z / ⇧⌘Z | Desfazer / refazer |
| ⌘X / ⌘C / ⌘V | Recortar, copiar e colar (slides ou objetos, conforme a última área clicada) |
| ⌘D | Duplicar slides ou objetos |
| ⌫ | Excluir slides ou objetos |
| ⌘A | Selecionar todos os slides ou todos os objetos do slide |
| ⇧⌘N | Novo slide |
| ⌘↑ / ⌘↓ | Mover o slide para cima / para baixo |
| Setas / ⇧ + setas | Mover o objeto 1 px / 10 px |
| ⌘ + setas | Redimensionar o objeto |
| ⌘↵ | Apresentar |
| ⌘E | Exportar |
| ⌥⌘0 | Mostrar / ocultar a lista de slides |
| ⇧⌘A | Abrir / fechar o assistente de IA |
| ⌘= / ⌘− / ⌘0 | Ampliar / reduzir / tamanho real do slide |
| ⇧⌘+ / ⇧⌘− | Aumentar / diminuir as letras da interface |
| ⌘, | Configurações |
| Esc | Cancelar o gesto em andamento |
