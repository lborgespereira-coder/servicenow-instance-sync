var ApiAmigo = Class.create();
ApiAmigo.prototype = {
    initialize: function() {},

    enviar: function(current) {

        try {
            var req = new sn_ws.RESTMessageV2();
            var instance = 'https://sua-instancia.service-now.com';

            var method, endpoint;

            if (current.u_sys_id_remoto) {
                method = 'PUT';
                endpoint = instance + '/api/now/table/incident/' + current.u_sys_id_remoto;
            } else {
                method = 'POST';
                endpoint = instance + '/api/now/table/incident';
            }

            req.setEndpoint(endpoint);
            req.setHttpMethod(method);
            req.setBasicAuth('lucas.borges', '*******');

            req.setRequestHeader('Accept', 'application/json');
            req.setRequestHeader('Content-Type', 'application/json');

            var lastComment = "";
            var lastWorkNote = "";

            if (current.comments.changes()) {
                var grComment = new GlideRecord('sys_journal_field');
                grComment.addQuery('element_id', current.sys_id);
                grComment.addQuery('element', 'comments');
                grComment.orderByDesc('sys_created_on');
                grComment.setLimit(1);
                grComment.query();

                if (grComment.next()) {
                    lastComment = grComment.value.toString();
                }
            }

            if (current.work_notes.changes()) {
                var grNote = new GlideRecord('sys_journal_field');
                grNote.addQuery('element_id', current.sys_id);
                grNote.addQuery('element', 'work_notes');
                grNote.orderByDesc('sys_created_on');
                grNote.setLimit(1);
                grNote.query();

                if (grNote.next()) {
                    lastWorkNote = grNote.value.toString();
                }
            }

            var body = {
                short_description: current.short_description.toString(),
                description: current.description.toString(),
                state: current.state.toString(),
                contact_type: current.contact_type ? current.contact_type.toString() : '',
                impact: current.impact.toString(),
                urgency: current.urgency.toString(),
                category: current.category.toString(),
                business_service: current.business_service ? current.business_service.toString() : '',
            };

            if (lastComment) {
                body.comments = lastComment;
            }

            if (lastWorkNote) {
                body.work_notes = lastWorkNote;
            }

            gs.info('PAYLOAD ENVIADO: ' + JSON.stringify(body));

            req.setRequestBody(JSON.stringify(body));

            var response = req.execute();
            var status = response.getStatusCode();
            var responseBody = JSON.parse(response.getBody());

            if (!current.u_sys_id_remoto && (status == 200 || status == 201)) {
                current.u_sys_id_remoto = responseBody.result.sys_id;

                current.setWorkflow(false);
                current.update();
            }

        } catch (ex) {
            gs.error('Erro integração: ' + ex.message);
        }

    },

    type: 'ApiAmigo'
};
