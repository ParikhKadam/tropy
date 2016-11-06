'use strict'

const React = require('react')
const { PropTypes } = React
const { connect } = require('react-redux')
const { Field } = require('./field')
const { metadata, ui } = require('../../actions')
const { get } = require('dot-prop')


const Fields = (props) => {
  const { template, editing } = props

  return (
    <ol className="metadata-fields">{
      template.map(property =>
        <Field {...props}
          key={property.name}
          property={property}
          editing={editing === property.name}/>
      )
    }</ol>
  )
}

Fields.propTypes = {
  editing: PropTypes.string,
  template: PropTypes.array.isRequired,
  id: PropTypes.number.isRequired,
  data: PropTypes.object,
  onActivate: PropTypes.func,
  onCancel: PropTypes.func,
  onChange: PropTypes.func,
  onContextMenu: PropTypes.func
}


module.exports = {
  Fields: connect(
    (state, { id }) => ({
      data: state.metadata[id] || {},
      editing: get(state, `ui.edit.field.${id}`)
    }),

    (dispatch, { id }) => ({
      onActivate(property) {
        dispatch(ui.edit.start({ field: { [id]: property } }))
      },

      onCancel() {
        dispatch(ui.edit.cancel())
      },

      onChange(data) {
        dispatch(metadata.save({ id, data }))
        dispatch(ui.edit.cancel())
      },

      onContextMenu(property) {
        dispatch(ui.context.show(event, 'metadata', { id, property }))
      }
    })
  )(Fields)
}
