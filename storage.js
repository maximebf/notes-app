
export class GitlabStore {
    static getDisplayName() {
        return 'Gitlab';
    }

    static getRequiredOptions() {
        return [
            {name: 'baseUrl', title: 'Base URL of the installation?'},
            {name: 'token', title: 'Personnal access token'}
        ];
    }

    static getSavedName(options) {
        return `Gitlab (${options.baseUrl})`;
    }

    constructor(options) {
        this.baseUrl =  options.baseUrl;
        this.authorizationToken = options.token;
    }

    authorize() {
        if (this.authorizationToken) {
            return Promise.resolve();
        }
        document.location = this.joinData(this.baseUrl + '/oauth/authorize', {
            client_id: '',
            redirect_uri: '',
            response_type: '',
            state: YOUR_UNIQUE_STATE_HASH
        });
    }

    joinData(action, data) {
        if (action.indexOf('?') !== -1) {
            action.substring(action.indexOf('?') + 1).split('&').forEach(function(item) {
                let parts = item.split('=');
                if (typeof(data[parts[0]]) === 'undefined') {
                    data[parts[0]] = decodeURIComponent(parts[1]);
                }
            });
            action = action.substring(0, action.indexOf('?'));
        }
        let dataStr = Object.entries(data).map(([key, value]) => {
           return key + '=' + encodeURIComponent(value);
        });
        return action + '?' + dataStr.join('&');
    }

    fetch(action, options) {
        let params = Object.assign({
            headers: {
                //'Authorization': 'Bearer ' + this.authorizationToken
                'Private-Token': this.authorizationToken
            }
        }, options);

        if (params.data) {
            let data = new FormData();
            Object.entries(params.data).forEach(([key, value]) => {
                data.set(key, value);
            });
            delete params.data;
            params.body = data;
        }

        return fetch(this.baseUrl + '/api/v4/' + action, params).then(response => {
            if (response.ok) {
                return Promise.resolve(response);
            }
            return Promise.reject(response);
        })
    }

    async query(action, options, fetchedData) {
        const response = await this.fetch(action, options);
        let data = await response.json();
        if (fetchedData) {
            data = fetchedData.concat(data);
        }
        if (response.headers.has('X-Next-Page')) {
            const next = response.headers.get('X-Next-Page');
            if (next) {
                return this.query(this.joinData(action, {page: next}), options, data);
            }
        }
        return data;
    }

    getUsername() {
        return this.query('user').then(user => user.username);
    }

    async getNotebooks() {
        const projects = await this.query('projects');
        return projects.map(project => {
            return {
                id: project.id,
                name: project.name
            };
        });
    }

    async getFileAsNote(notebook, path) {
        const file = await this.query(`projects/${notebook.id}/repository/files/${encodeURIComponent(path)}?ref=master`);
        const commit = await this.query(`projects/${notebook.id}/repository/commits/${file.last_commit_id}`);
        const content = atob(file.content);
        return {
            id: file.file_path,
            content: content,
            date: new Date(commit.created_at)
        };
    }

    async getNotes(notebook) {
        let files;
        try {
            files = await this.query(`projects/${notebook.id}/repository/tree`);
        } catch(e) {
            files = [];
        }
        return Promise.all(files.filter(file => file.type === 'blob')
                                .map(file => this.getFileAsNote(notebook, file.path)));
    }

    async createNote(notebook) {
        const now = new Date();
        const path = `note-${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}.md`;
        const file = await this.query(`projects/${notebook.id}/repository/files/${encodeURIComponent(path)}`, {
            method: 'POST',
            data: {
                branch: 'master',
                content: '',
                commit_message: 'Created new note'
            }
        });
        return this.getFileAsNote(notebook, path);
    }

    async updateNote(notebook, note, content) {
        await this.query(`projects/${notebook.id}/repository/files/${encodeURIComponent(note.id)}`, {
            method: 'PUT',
            data: {
                branch: 'master',
                content: content,
                commit_message: 'Updated note'
            }
        });
        return this.getFileAsNote(notebook, note.id);
    }

    removeNote(notebook, note) {
        return this.fetch(`projects/${notebook.id}/repository/files/${encodeURIComponent(note.id)}`, {
            method: 'DELETE',
            data: {
                branch: 'master',
                commit_message: 'Removed note'
            }
        });
    }
}
