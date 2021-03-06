const app = getApp()
const db = wx.cloud.database()
const tools = require('../../../../utils/tools.js')

Page({
  data: {
    customBarHeight: 0,
    config: {},
    watcher: null,
    timer: null,
    vtabs: [],
    activeTab: 0,
    current: null,
    dialog: {
      detail: false,
      base: false,
      vary: false,
      combo: false,
      order: false
    },
    menu: {
      ready: false,
      data: {},
      remain: {},
      count: {}
    },
    order: {
      list: [],
      total: {
        menu: 0,
        money: 0,
        pack_money: 0,
        reward_money: 0
      }
    }
  },
  onLoad(options) {
    let self = this
    self.setData({
      customBarHeight: app.globalData.customBarHeight,
      searchMenu: self.searchMenu.bind(self)
    })
    wx.showLoading({
      title: '正在加载',
      mask: true
    })
    self.data.timer = setInterval(() => {
      if (self.data.menu.ready) {
        clearInterval(self.data.timer)
      } else {
        wx.showLoading({
          title: '请耐心等候',
          mask: true
        })
      }
    }, 3000)
    self.loadColumn()
  },
  onUnload() {
    let self = this
    if (self.data.timer) {
      clearInterval(self.data.timer)
    }
    if (self.data.watcher) {
      self.data.watcher.close()
    }
  },
  onShow() {
    let self = this
    if (self.data.back) {
      if (self.data.watcher == null) {
        self.listenMenu()
      }
      self.loadCache()
    } else {
      self.data.back = true
    }
  },
  listenMenu() {
    let self = this
    self.data.watcher = db.collection('menu').where({
      is_deleted: false,
      visible: true,
      scope: 'outside'
    }).orderBy('priority', 'asc').watch({
      onChange: function (snapshot) {
        let remain = {}
        snapshot.docs.forEach(item => {
          if (item.sku && item.sku.active) {
            remain[item._id] = item.sku.total - item.sku.count
          } else if (remain[item._id]) {
            delete remain[item._id]
          }
        })
        self.setData({
          'menu.remain': remain
        })
        app.globalData.rt_data.menu_remain = remain
      },
      onError: function (err) {
        console.log('reconnect outside')
        setTimeout(() => {
          self.listenMenu()
        }, 3000)
      }
    })
  },
  loadMenu() {
    let self = this
    db.collection('menu')
      .aggregate()
      .match({
        is_deleted: false,
        visible: true,
        scope: 'outside'
      })
      .sort({
        priority: 1
      }).limit(1000).end().then(res => {
        let data = {}
        let remain = {}
        let vtabs = self.data.vtabs
        res.list.forEach(item1 => {
          data[item1._id] = item1
          if (item1.sku && item1.sku.active) {
            remain[item1._id] = item1.sku.total - item1.sku.count
          }
          vtabs.forEach(item2 => {
            if (item1.column.outside.includes(item2.id)) {
              item2.items.push(item1._id)
            }
          })
        })
        for (let key in data) {
          if (data[key].type == 'combo') {
            data[key].combo.forEach(item => {
              item.list = item.list.filter(temp => {
                return data[temp] != undefined
              })
            })
          }
        }
        self.setData({
          vtabs: vtabs,
          'menu.ready': true,
          'menu.data': data,
          'menu.remain': remain
        })
        self.loadCache()
        app.globalData.rt_data.menu_data = data
        app.globalData.rt_data.menu_remain = remain
        wx.hideLoading()
      }).catch(err => {
        wx.hideLoading()
        wx.showModal({
          title: '加载失败',
          content: '网络不好，重新加载？',
          success(res) {
            if (res.confirm) {
              self.loadMenu()
            } else if (res.cancel) {
              self.back()
            }
          }
        })
      })
  },
  loadColumn() {
    let self = this
    let vtabs = self.data.vtabs
    app.globalData.column.forEach(item => {
      if (item.visible && item.scope.includes('outside')) {
        vtabs.push({
          id: item._id,
          title: item.name,
          items: []
        })
      }
    })
    self.loadMenu()
  },
  loadCache() {
    try {
      let self = this
      let order_list = []
      let cache_list = wx.getStorageSync('temp_outside')
      if (cache_list) {
        let count = {}
        cache_list.forEach(item1 => {
          if (self.data.menu.data[item1.id]) {
            order_list.push(item1)
            let menu = self.data.menu.data[item1.id]
            if (count[menu._id]) {
              count[menu._id] += item1.amount
            } else {
              count[menu._id] = item1.amount
            }
            if (menu.type == 'combo') {
              item1.form.combo.forEach(item2 => {
                item2.forEach(item3 => {
                  if (count[item3.id]) {
                    count[item3.id] += item1.amount
                  } else {
                    count[item3.id] = item1.amount
                  }
                })
              })
            }
          }
        })
        self.setData({
          'order.list': order_list,
          'menu.count': count
        })
      } else {
        self.setData({
          'order.list': [],
          'menu.count': {}
        })
      }
      self.statTotal()
    } catch (e) {
      console.error(e)
    }
  },
  searchMenu(value) {
    return new Promise((resolve, reject) => {
      let result = []
      let self = this
      let data = self.data.menu.data
      let column = self.data.vtabs.map(item => {
        return item.id
      })
      let keyword = value.trim()
      if (keyword != '') {
        for (let i in data) {
          let menu = data[i]
          if (menu.name.includes(keyword)) {
            menu.column.outside.forEach(item=>{
              if (column.includes(item)) {
                result.push({
                  text: menu.name, 
                  value: menu._id
                })
              }
            })
          }
        }
      }
      resolve(result)
    })
  },
  searchBack(e) {
    let self = this
    let id = e.detail.item.value
    self.setData({
      current: self.data.menu.data[id],
      'dialog.detail': true
    })
  },
  showDetail(e) {
    let self = this
    let id = e.currentTarget.dataset.id
    self.setData({
      current: self.data.menu.data[id],
      'dialog.detail': true
    })
  },
  selectMenu(e) {
    let self = this
    let id = e.currentTarget.dataset.id
    let menu = self.data.menu.data[id]
    switch (menu.type) {
      case 'single':
        self.setData({
          current: menu,
          'dialog.base': true
        })
        break
      case 'vary':
        self.setData({
          current: menu,
          'dialog.vary': true
        })
        break  
      case 'combo':
        self.setData({
          current: menu,
          'dialog.combo': true
        })
    }
  },
  chooseMenu() {
    let self = this
    switch (self.data.current.type) {
      case 'single':
        self.setData({
          'dialog.base': true
        })
        break
      case 'vary':
        self.setData({
          'dialog.vary': true
        })
        break
      case 'combo':
        self.setData({
          'dialog.combo': true
        })
    }
  },
  addOrder(e) {
    let self = this
    let list = self.data.order.list
    let menu = self.data.current
    let count = self.data.menu.count
    let exist = false
    list.forEach(item=>{
      if (item.id == menu._id && JSON.stringify(item.form) == JSON.stringify(e.detail)) {
        item.amount = item.amount + 1
        exist = true
        return
      }
    })
    if (!exist) {
      list.push({
        id: menu._id,
        type: menu.type,
        form: tools.objCopy(e.detail),
        amount: 1
      })
    }
    if (count[menu._id]) {
      count[menu._id]++
    } else {
      count[menu._id] = 1
    }
    if (menu.type == 'combo') {
      e.detail.combo.forEach(item1 => {
        item1.forEach(item2 => {
          if (count[item2.id]) {
            count[item2.id]++
          } else {
            count[item2.id] = 1
          }
        })
      })
    }
    self.setData({
      'order.list': list,
      'menu.count': count
    })
    self.statTotal()
  },
  showLack() {
    wx.showToast({
      icon: 'none',
      title: '当前菜品备料不足',
      duration: 2000
    })
  },
  showOrder() {
    let self = this
    if (self.data.order.list.length > 0) {
      self.setData({
        'dialog.order': true
      })
    }
  },
  clearOrder() {
    let self = this
    wx.setStorage({
      key: 'temp_outside',
      data: []
    })
    self.setData({
      'menu.count': {},
      'order.list': [],
      'dialog.order': false
    })
    self.statTotal()
  },
  affirmOrder() {
    let self = this
    self.setData({
      'dialog.order': false
    })
    if (self.data.order.total.menu > 0) {
      wx.navigateTo({
        url: 'affirm'
      })
    }
  },
  addOrderAmount(e) {
    let self = this
    let index = e.detail.index
    let list = self.data.order.list
    let item = list[index]
    let temp = {}
    let count = self.data.menu.count
    let remain = self.data.menu.remain
    let lack = false
    if (item.type == 'combo') {
      let combo = item.form.combo
      for (let i in combo) {
        for (let j in combo[i]) {
          if (remain[combo[i][j].id] && (remain[combo[i][j].id] <= count[combo[i][j].id])) {
            lack = true
            break
          }
          if (temp[combo[i][j].id]) {
            temp[combo[i][j].id]++
          } else {
            temp[combo[i][j].id] = 1
          }
        }
      }
    }
    if (lack || (remain[item.id] && (remain[item.id] <= count[item.id]))) {
      wx.showToast({
        icon: 'none',
        title: '菜品备料不足',
        duration: 2000
      })
      return
    }
    if (temp[item.id]) {
      temp[item.id]++
    } else {
      temp[item.id] = 1
    }
    item.amount++
    for (let id in temp) {
      count[id] += temp[id]
    }
    self.setData({
      'order.list': list,
      'menu.count': count
    })
    self.statTotal()
  },
  subOrderAmount(e) {
    let self = this
    let index = e.detail.index
    let list = self.data.order.list
    let item = list[index]
    let count = self.data.menu.count
    if (item.type == 'combo') {
      item.form.combo.forEach(item1 => {
        item1.forEach(item2 => {
          count[item2.id]--
        })
      })
    }
    item.amount--
    count[item.id]--
    if (item.amount == 0) {
      list.splice(index, 1)
    }
    self.setData({
      'menu.count': count,
      'order.list': list
    })
    self.statTotal()
  },
  addMenuAmount(e) {
    let self = this
    let id = e.currentTarget.dataset.id
    let count = self.data.menu.count
    let list = self.data.order.list
    let item = list.find(item => {
      return item.id == id
    })
    if (item) {
      item.amount++
        count[id]++
      self.setData({
          'order.list': list,
          'menu.count': count
        })
      self.statTotal()
    } else {
      let menu = self.data.menu.data[id]
      list.push({
        id: menu._id,
        type: menu.type,
        form: {
          pack: true
        },
        amount: 1
      })
      if (count[id]) {
        count[id]++
      } else {
        count[id] = 1
      }
      self.setData({
        'order.list': list,
        'menu.count': count
      })
      self.statTotal()
    }
  },
  subMenuAmount(e) {
    let self = this
    let id = e.currentTarget.dataset.id
    let count = self.data.menu.count
    let list = self.data.order.list
    let index = list.findIndex(item => item.id == id)
    if (index > -1) {
      let item = list[index]
      item.amount--
        count[id]--
        if (item.amount == 0) {
          list.splice(index, 1)
        }
        self.setData({
          'menu.count': count,
          'order.list': list
        })
      self.statTotal()
    } else {
      wx.showToast({
        icon: 'none',
        title: '套餐菜品不能减少',
        duration: 2000
      })
    }
  },
  addMenuAmount2() {
    let self = this
    let id = self.data.current._id
    let count = self.data.menu.count
    let list = self.data.order.list
    let item = list.find(item => {
      return item.id == id
    })
    if (item) {
      item.amount++
        count[id]++
      self.setData({
          'order.list': list,
          'menu.count': count
        })
      self.statTotal()
    } else {
      let menu = self.data.menu.data[id]
      list.push({
        id: menu._id,
        type: menu.type,
        form: {
          pack: true
        },
        amount: 1
      })
      if (count[id]) {
        count[id]++
      } else {
        count[id] = 1
      }
      self.setData({
        'order.list': list,
        'menu.count': count
      })
      self.statTotal()
    }
  },
  subMenuAmount2() {
    let self = this
    let id = self.data.current._id
    let count = self.data.menu.count
    let list = self.data.order.list
    let index = list.findIndex(item => item.id == id)
    if (index > -1) {
      let item = list[index]
      item.amount--
        count[id]--
        if (item.amount == 0) {
          list.splice(index, 1)
        }
        self.setData({
          'menu.count': count,
          'order.list': list
        })
      self.statTotal()
    } else {
      wx.showToast({
        icon: 'none',
        title: '套餐菜品不能减少',
        duration: 2000
      })
    }
  },
  statTotal() {
    let self = this
    let total_menu = 0
    let total_money = 0
    let total_pack_money = 0
    let total_reward_money = 0
    self.data.order.list.forEach(item => {
      let menu = self.data.menu.data[item.id]
      let price = menu.price
        if (item.form.raise) {
          price += item.form.raise
        }
      if (item.form.pack) {
        if (menu.pack.mode == 'every') {
          total_pack_money += menu.pack.money * item.amount
        } else {
          total_pack_money += menu.pack.money
        }
      }
      total_money += price * item.amount
      total_menu += item.amount
      if (item.form.gift) {
        total_reward_money += price * item.amount
      }
    })
    total_money += total_pack_money
    self.setData({
      'order.total.menu': total_menu,
      'order.total.money': total_money,
      'order.total.pack_money': total_pack_money,
      'order.total.reward_money': total_reward_money
    })
    wx.setStorage({
      key: 'temp_outside',
      data: self.data.order.list
    })
  },
  stopEvent() {}
})