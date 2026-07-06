(function executeRule(current, previous /*null when async*/) {

	var integracao = new ApiAmigo();
	integracao.enviar(current);

})(current, previous);
