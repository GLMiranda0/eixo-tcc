-- 005 · Textos das ações corretivas em linguagem de operação
-- A descrição da primeira ação do padrão "sobrecarga" citava o ensaio de laboratório
-- ("Na bancada: afrouxar o freio de carga…"). Na plataforma o texto precisa valer para
-- qualquer instalação. Aplicar no SQL editor do projeto, depois da 004.

update acoes_corretivas
   set descricao = 'Alivie a carga acoplada (válvula, correia, freio ou setpoint do inversor) até a vibração voltar abaixo de 2,8 mm/s.'
 where padrao = 'sobrecarga' and ordem = 1;
