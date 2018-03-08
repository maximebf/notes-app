import * as availableStores from '/storage.js';

const icon = component(props => h('i', {class: 'fa fa-' + props.name}));

const loading = component(() => h('div', {class: 'loading'}, icon({name: 'spin fa-spinner'}), ' Loading...'));

const noteTitle = note => {
    if (note.content == '') {
        return 'Empty note';
    }
    return note.content.split("\n")[0].substr(0, 50);
};

const sortNotes = notes => {
    return notes.sort((a, b) => (a.date < b.date) - (a.date > b.date));
}

const noteListItem = component(function(props, children) {
    return h('a', {
        href: '#',
        'data-note-id': props.note.id,
        class: 'note-list-item ' + (props.selected === props.note.id ? 'active' : ''),
        onclick: e => this.dispatch(e, 'SelectNote', props.note)
    },
        h('h5', {}, noteTitle(props.note)),
        h('small', {}, props.note.date.toLocaleDateString())
    );
});

const noteList = component(function(props, children) {
    this.on('SelectNote', e => {
        this.querySelectorAll('a.note-list-item.active').forEach(n => n.classList.remove('active'));
        this.querySelector(`a.note-list-item[data-note-id="${e.detail.id}"]`).classList.add('active');
    });

    return h('div', {class: 'note-list'},
        sortNotes(props.notes).map(note =>
            noteListItem({note, selected: props.selected || (props.notes.length ? props.notes[0].id : null)})
        )
    );
});

const selectMostRecentNoteAfterChange = () => {
    return new Promise((resolve, reject) => {
        on('NotesChanged', e => requestAnimationFrame(() => {
            dispatch('SelectNote', e.detail[0]);
            resolve();
        }), true);
    });
}

const noteEditor = component(function(props, children) {
    this.onconnect(() => {
        const editor = new SimpleMDE({
            element: this.querySelector('#editor'),
            autofocus: true,
            spellChecker: false,
            status: false,
            toolbar: [
                {
                    name: "custom",
                    className: "fa fa-upload",
                    title: "Save",
                    action: () => {
                        this.dispatch('UpdateNote', {
                            note: props.note,
                            content: editor.value()
                        });
                    }
                },
                {
                    name: "custom",
                    className: "fa fa-trash",
                    title: "Delete",
                    action: () => {
                        if (confirm('Are you sure?')) {
                            this.dispatch('RemoveNote', props.note);
                        }
                    }
                },
                "|",
                "code",
                "quote",
                "unordered-list",
                "ordered-list",
                "table",
                "|",
                "preview",
                "side-by-side",
                "fullscreen"
            ]
        });
        editor.value(props.note.content);
    });

    return h('div', {class: 'note-editor'}, h('textarea', {id: 'editor'}));
});

const notebookSelector = component(function(props, children) {
    return h('select', {
        class: 'notebook-selector',
        onclick: e => {
            this.dispatch(e, 'SelectNotebook', props.notebooks.find(nb => nb.id == this.node.value));
        }
    }, props.notebooks.map(nb => h('option', {value: nb.id}, nb.name)));
});

const notebookSearch = component(function(props, children) {
    let debounce;
    return h('input', {
        type: 'text',
        placeholder: 'Search',
        class: 'notebook-search',
        onkeyup: e => {
            if (debounce) {
                clearTimeout(debounce);
            }
            if (e.charCode === 13 || this.node.value === '') {
                this.dispatch('SearchNote', this.node.value);
            } else {
                debounce = setTimeout(() => {
                    this.dispatch('SearchNote', this.node.value);
                }, 500);
            }
        }
    });
});

const createNoteBtn = component(function(props, children) {
    return h('button', {class: 'btn create-note-btn', onclick: e => {
        this.dispatch(e, 'CreateNote');
        this.node.disabled = true;
        h(this.node, {}, icon({name: 'spin fa-spinner'}));
        selectMostRecentNoteAfterChange().then(() => {
            this.node.disabled = false;
            h(this.node, {}, icon({name: 'plus'}));
        });
    }}, icon({name: 'plus'}));
});

const notebook = component(function(props, children) {
    let selected;
    this.on('SelectNotebook', () => { selected = null });
    this.on('SelectNote', e => { selected = e.detail.id }); // cached selected note when re-rendering

    return h('div', {class: 'notebook'},
        h('nav', {},
            h('div', {class: 'nav-main'},
                connect('NotesChanged', () => h('div', {class: 'notebook-toolbar'},
                    notebookSearch(),
                    createNoteBtn()
                ), null, true),
                connect({
                    SelectNotebook: () => loading(),
                    NotesChanged: e => noteList({notes: e.detail, selected: selected})
                }, loading())
            ),
            h('div', {class: 'nav-bottom'},
                connect('NotebooksChanged', e => notebookSelector({notebooks: e.detail})),
                props.store.getUsername().then(username => h('div', {class: 'username'}, `Logged in as ${username}`))
            )
        ),
        h('main', {},
            connect('SelectNote', e => noteEditor({note: e.detail},
                h('span', {}, 'Select a note to start editing')))
        )
    );
});

const getSavedStores = () => {
    return JSON.parse(localStorage.getItem('saved-stores') || '[]');
}

const updateSavedStores = (saved) => {
    localStorage.setItem('saved-stores', JSON.stringify(saved));
    dispatch('SavedStoresChanged');
};

const storeChooser = component(props => {
    const start = (storeClass, options) => {
        const store = new storeClass(options);
        store.authorize().then(() => dispatch('Connected', store));
    };

    return h('div', {class: 'store-chooser'},
        h('h1', {}, 'Notes'),
        connect('SavedStoresChanged', () => {
            const saved = getSavedStores();
            return h('div', {class: 'saved-stores'}, saved.map(data => {
                return h('div', {class: 'btn-group'},
                    h('button', {class: 'btn large', onclick: e => {
                        start(availableStores[data.storeClass], data.options);
                    }}, data.name),
                    h('button', {class: 'btn', onclick: e => {
                        saved.splice(saved.indexOf(data), 1);
                        updateSavedStores(saved);
                    }}, icon({name: 'trash'}))
                );
            }))
        }, true),
        h('div', {class: 'available-stores'}, Object.keys(availableStores).map(storeClassName => {
            const storeClass = availableStores[storeClassName];
            return h('button', {class: 'btn', onclick: e => {
                let opts = {};
                storeClass.getRequiredOptions().forEach(opt => {
                    opts[opt.name] = prompt(opt.title);
                });
                const saved = getSavedStores();
                saved.push({
                    name: storeClass.getSavedName(opts),
                    storeClass: storeClassName,
                    options: opts
                });
                updateSavedStores(saved);
                start(storeClass, opts);
            }}, storeClass.getDisplayName());
        }))
    );
});

let store;
let currentNotebook;
let notes = [];

App({
    AppReady: () => {
        h(document.body, {},
            connect('Connected', e => notebook({store: e.detail}), storeChooser(), true)
        );
    },
    Connected: e => {
        store = e.detail;
        store.getNotebooks().then(notebooks =>{
            dispatch('NotebooksChanged', notebooks);
            dispatch('SelectNotebook', notebooks[0]);
        });
    },
    SelectNotebook: e => {
        currentNotebook = e.detail;
        store.getNotes(currentNotebook).then(notes_ => {
            notes = sortNotes(notes_);
            dispatch('NotesChanged', notes);
            dispatch('SelectNote', notes[0]);
        });
    },
    CreateNote: () => {
        store.createNote(currentNotebook).then(note => {
            notes.push(note);
            dispatch('NotesChanged', notes);
        });
    },
    UpdateNote: e => {
        store.updateNote(currentNotebook, e.detail.note, e.detail.content).then(note => {
            notes.splice(notes.indexOf(e.detail.note), 1);
            notes.push(note);
            dispatch('NotesChanged', notes);
        });
    },
    RemoveNote: e => {
        store.removeNote(currentNotebook, e.detail).then(() => {
            notes.splice(notes.indexOf(e.detail), 1);
            dispatch('NotesChanged', notes);
        });
    },
    SearchNote: e => {
        if (!e.detail) {
            dispatch('NotesChanged', notes);
        } else {
            dispatch('NotesChanged', notes.filter(note => note.content.toLowerCase().indexOf(e.detail.toLowerCase()) !== -1));
        }
    }
});
