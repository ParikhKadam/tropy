import { createRef, forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { func, instanceOf, string } from 'prop-types'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { nodeViews } from '../../editor/schema.js'
import { useEvent } from '../../hooks/use-event.js'
import { useWindow } from '../../hooks/use-window.js'
import { stylesheet } from '../../dom.js'
import { isMeta } from '../../keymap.js'
import { StyleSheet } from '../../res.js'


export const ProseMirror = forwardRef(({
  onBlur,
  onChange,
  onFocus,
  onKeyDown,
  srcDoc,
  state
}, ref) => {
  let frame = createRef()
  let [view, setView] = useState()
  let win = useWindow()

  // TODO isReadOnly, isDisabled, tabIndex

  let handleLoad = useEvent(() => {
    setView(new EditorView(frame.current.contentDocument.body, {
      dispatchTransaction: onChange,
      state,
      nodeViews,
      handleClick,
      handleKeyDown: onKeyDown,
      handleDOMEvents: {
        blur: onBlur,
        focus: onFocus
      }
    }))
  })

  let handleClick = useEvent((v, pos, event) => {
    if (!v.editable) v.dom.focus()
    return isMeta(event) // disable PM's block select
  })

  // TODO handle container click (links)

  useImperativeHandle(ref, () => view, [view])

  useEffect(() => {
    let href = StyleSheet.expand(`editor-${win.theme}`)
    let head = frame.current.contentDocument.head

    head.replaceChildren(stylesheet(href))

  }, [win.theme, frame])

  useEffect(() => {
    view?.updateState(state)
  }, [state, view])


  return (
    <iframe
      ref={frame}
      className="prosemirror"
      srcDoc={srcDoc}
      onLoad={handleLoad}/>
  )
})

ProseMirror.propTypes = {
  // Subtle: event handlers are passed to PM on initialization
  // and they will not be updated. Use stable references!
  onBlur: func,
  onChange: func.isRequired, // dispatchTransaction
  onFocus: func,
  onKeyDown: func.isRequired,

  state: instanceOf(EditorState),
  srcDoc: string.isRequired
}

ProseMirror.defaultProps = {
  srcDoc: '<!DOCTYPE html><html><head></head><body></body></html>'
}