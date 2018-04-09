/*
 * jQuery Sokoban
 * http://galdrar.net/sokoban
 *
 * Copyright (c) 2009 Borgar Þorsteinsson
 * Licensed under the terms of the GPL v3 license.
 * http://www.gnu.org/licenses/gpl-3.0.html
 *
 */
(function ($) {
	const _R = RegExp
	const _LINE = /^(\s*)(\#|\#[ \.\@\+\$\*\#]*\#)(\s*)$/
	const _CLS = 'soko-'
	const _LC = $('<div class="' + _CLS + 'room"></div>')

	function _obj() {
		return {}
	}

	function reMap(a) {
		return {
			dock: "+*.".indexOf(a) !== -1,
			box: "$*".indexOf(a) !== -1,
			man: "+@".indexOf(a) !== -1,
			wall: (a === '#')
		}
	}

	function Sokoban(level) {
		this.level = $(level)
		this.original = this.level.text()
		var ok = this.processLevelData()
		this.room = this.level.children('soko-room')
		if (ok) {
			// keypress doesn't work in safari
			this.level.bind('keydown', function (event) {
				$(this).data('sokoban').keyHandler(event)
				return false
			})
			this.level.bind('click', function (event) {
				if (event.target.parentNode.className === 'soko-line') {
					$(this).data('sokoban').clickHandler(event)
					return false
				}
				return true
			})
			this.level.bind('wheel', function (event) {
				if (event.target.parentNode.className === 'soko-line') {
					$(this).data('sokoban').wheelHandler(event)
					return false
				}
				return true
			})
		}
	}
	Sokoban.prototype = {
		processLevelData: function () {
			let pre = []
			let post = []
			let level = []
			let wid = 0
			let lines = this.level.text().split('\n')
			let line
			for (line, i = 0; i < lines.length; i++) {
				line = lines[i]
				if (_LINE.test(line)) {
					wid = Math.max(wid, (_R.$1 + _R.$2).length)
					level.push($.map(_R.$1.split(''), _obj).concat($.map(_R.$2.split(''), reMap)))
				} else {
					if (level.length > 0) {
						post = lines.slice(i)
						break
					}
					pre.push(line)
				}
			}
			this.levelData = level
			this.height = level.length
			this.width = wid
			this.indentCleanup()
			this.levelContainer = _LC.clone()
			this.moves = 0
			this.pushes = 0
			let men = this.count('man'),
				docks = this.count('dock'),
				boxes = this.count('box')
			if (men !== 1 || docks !== boxes || this.height < 3 || this.width < 3) {
				// this is an unplayable level
				return false
			}
			this.level.empty().append('<div>' + pre.join('\n') + '\n</div>').append(this.levelContainer.empty()).append('<div>' + post.join('\n') + '</div>')
			this.undoBuffer = []
			this.levelContainer.append(this.renderLevel()).attr('tabindex', 1) // focusable
			this.reTitle()
			return true
		},
		indentCleanup: function () {
			this.scanLevel(function (t, x, y) {
				if (x === 0 || y === 0 || x === this.width - 1 || y === this.height - 1) {
					this.floodFill(x, y)
				}
			})
		},
		floodFill: function (x, y) {
			if (x > -1 && y > -1 && y < this.height && x < this.width) {
				var c = this.levelData[y][x] || {}
				if (!c.wall && !c.box && !c.man && !c.dock && !c.overflow) {
					c.overflow = true
					this.levelData[y][x] = c
					this.floodFill(x - 1, y).floodFill(x, y - 1).floodFill(x + 1, y).floodFill(x, y + 1)
				}
			}
			return this
		},
		reTitle: function () {
			let s = this.boxesLeft ? '' : 'Solved: '
			this.levelContainer.attr('title', s + this.moves + ' / ' + this.pushes)
		},
		renderLevel: function () {
			let r = ''
			let P = ' ' + _CLS
			this.boxesLeft = 0
			for (var y = 0; y < this.height; y++) {
				r += '<div class="' + _CLS + 'line">'
				for (var x = 0; x < this.width; x++) {
					let t = this.levelData[y][x] || _obj(),
						s = '&nbsp;',
						c = t.overflow ? _CLS + 'indent' : _CLS + 'floor'
					if (t) {
						if (t.wall) {
							c = P + 'wall'
							s = '#'
						} else if (t.dock) {
							c = P + 'dock'
							s = '.'
							if (t.man) {
								c += P + 'worker'
								s = '+'
							} else if (t.box) {
								c += P + 'box'
								s = '*'
							}
						} else {
							if (t.man) {
								c += P + 'worker'
								s = '@'
							} else if (t.box) {
								c += P + 'box'
								s = '$'
								this.boxesLeft++
							}
						}
					}
					r += '<span class="' + $.trim(c) + '">' + s + '</span>'
				}
				r += '\n</div>'
			}
			return r
		},
		count: function (attr) {
			let r = 0
			this.scanLevel(function (t) {
				r += t[attr] ? 1 : 0
			})
			return r
		},
		manPosition: function () {
			let pos
			this.scanLevel(function (t, x, y) {
				if (t.man) {
					pos = {
						x,
						y
					}
					return false
				}
			})
			if (!pos) {
				throw 'man overboard'
			}
			return pos
		},
		scanLevel: function (callback) {
			let x, y, t, r
			for (y = 0; y < this.height; y++) {
				for (x = 0; x < this.width; x++) {
					t = this.levelData[y][x] || _obj()
					r = callback.call(this, t, x, y)
					if (r === false) {
						return r
					}
				}
			}
			return true
		},
		move: function (xofs, yofs) {
			let m = this.manPosition()
			let u = this.levelData[m.y + yofs][m.x + xofs]
			if (!u.wall) {
				if (u.box) {
					let uu = this.levelData[m.y + (yofs * 2)][m.x + (xofs * 2)]
					if (!uu.wall && !uu.box) {
						// worker may push
						this.undoPush()
						this.levelData[m.y][m.x].man = false
						u.man = true
						u.box = false
						uu.box = true
						this.pushes++
							this.levelContainer.html(this.renderLevel())
						this.reTitle()
					}
				} else {
					// worker may move
					this.undoPush()
					this.levelData[m.y][m.x].man = false
					u.man = true
					this.moves++
						this.levelContainer.html(this.renderLevel())
					this.reTitle()
				}
			}
		},
		undoPush: function () {
			this.undoBuffer.push([this.levelContainer.text(), this.moves, this.pushes])
		},
		undoPop: function () {
			let undo = this.undoBuffer.pop()
			if (undo) {
				let lines = undo[0].replace(/\n$/, '').split('\n'),
					level = []
				for (var line, i = 0; i < lines.length; i++) {
					line = lines[i].replace(/\u00A0/g, ' ')
					if (_LINE.test(line)) {
						level.push($.map(_R.$1.split(''), _obj).concat($.map(_R.$2.split(''), reMap)))
					} else {
						throw 'leaky undo buffer'
					}
				}
				this.moves = undo[1]
				this.pushes = undo[2]
				this.level.removeClass(_CLS + 'solved')
				this.levelData = level
				this.indentCleanup()
				this.reTitle()
				this.levelContainer.html(this.renderLevel())
			}
		},
		keyHandler: function (e) {
			// stop moving on solve
			if (this.boxesLeft) {
				if (e.keyCode === 38) { // up
					this.move(0, -1)
				} else if (e.keyCode === 40) { // down
					this.move(0, 1)
				} else if (e.keyCode === 37) { // left
					this.move(-1, 0)
				} else if (e.keyCode === 39) { // right
					this.move(1, 0)
				} else if (e.which === 8) { // backspace
					this.undoPop()
				} else if (e.charCode === 122 && (e.metaKey || e.ctrlKey)) { // ctrl-z
					this.undoPop()
				}
			}
			if (e.keyCode === 27) { // esc
				this.level.removeClass(_CLS + 'solved').text(this.original)
				this.processLevelData()
				let sc = $(window).scrollTop()
				this.levelContainer[0].focus()
				$(window).scrollTop(sc)
			}
			if (!this.boxesLeft) { // room is solved
				this.level.trigger('solved')
				this.level.addClass(_CLS + 'solved')
				this.undoBuffer = []
			}
		},
		wheelHandler: function (event) {
			event.preventDefault()
			if (event.originalEvent.deltaY >= 0) {
				this.undoPop()
			}
		},
		getGrid: function () {
			let levelData = this.levelData
			let grid = []
			let gridLines = []
			levelData.map(lines => {
				lines.map(line => {
					gridLines.push((line.man || line.box || line.wall) ? 1 : 0)
				})
				grid.push(gridLines)
				gridLines = []
			})
			return grid
		},
		pathFind: function (event) {
			const self = this
			event.preventDefault()
			let element = document.getElementsByClassName('soko-room')[0]
			let rect = element.getBoundingClientRect()
			let x = Math.trunc((event.clientX - rect.left) / 96)
			let y = Math.trunc((event.clientY - rect.top) / 96)
			let easystar = new EasyStar.js()
			let grid = this.getGrid()
			easystar.setAcceptableTiles(0)
			easystar.setGrid(grid)
			let manPosition = self.manPosition()
			let movements = []
			if (manPosition.x === x && manPosition.y === y) {
				return
			}
			let instanceId = easystar.findPath(manPosition.x, manPosition.y, x, y, function (path) {
				if (path !== null) {
					path.filter((coordinate, index) => {
						if (index + 1 < path.length) {
							let x = path[index + 1].x - path[index].x
							let y = path[index + 1].y - path[index].y
							movements.push({
								x,
								y
							})
						}
					})
					let step = 0
					let animation = setInterval(function () {
						let position = movements[step]
						self.move(position.x, position.y)
						if (step + 1 < movements.length) {
							step++
						} else {
							clearInterval(animation)
						}
					}, 40)
				}
			})
			easystar.calculate()

		},
		clickHandler: function (event) {
			this.pathFind(event)
		}
	}
	$.fn.sokoban = function () {
		return this.each(function () {
			let elm = $(this),
				ctl = elm.data('sokoban')
			if (!ctl && !elm.children().length) {
				elm.data('sokoban', new Sokoban(this))
			}
		})
	}
})(jQuery)