/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 0 : 0;
        var yOffset = options.yaxis.mode === "time" ? 0 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 710.0, "minX": 0.0, "maxY": 26329.0, "series": [{"data": [[0.0, 710.0], [0.1, 784.0], [0.2, 1420.0], [0.3, 1478.0], [0.4, 1511.0], [0.5, 1565.0], [0.6, 1582.0], [0.7, 1622.0], [0.8, 1713.0], [0.9, 1811.0], [1.0, 1878.0], [1.1, 1928.0], [1.2, 1978.0], [1.3, 2116.0], [1.4, 2157.0], [1.5, 2185.0], [1.6, 2240.0], [1.7, 2414.0], [1.8, 2460.0], [1.9, 2491.0], [2.0, 2607.0], [2.1, 2713.0], [2.2, 2727.0], [2.3, 2757.0], [2.4, 2796.0], [2.5, 2861.0], [2.6, 2891.0], [2.7, 3020.0], [2.8, 3082.0], [2.9, 3115.0], [3.0, 3203.0], [3.1, 3256.0], [3.2, 3338.0], [3.3, 3351.0], [3.4, 3427.0], [3.5, 3455.0], [3.6, 3477.0], [3.7, 3522.0], [3.8, 3529.0], [3.9, 3554.0], [4.0, 3574.0], [4.1, 3608.0], [4.2, 3636.0], [4.3, 3645.0], [4.4, 3662.0], [4.5, 3686.0], [4.6, 3712.0], [4.7, 3746.0], [4.8, 3747.0], [4.9, 3760.0], [5.0, 3776.0], [5.1, 3800.0], [5.2, 3825.0], [5.3, 3845.0], [5.4, 3865.0], [5.5, 3876.0], [5.6, 3887.0], [5.7, 3909.0], [5.8, 3921.0], [5.9, 3929.0], [6.0, 3941.0], [6.1, 3948.0], [6.2, 3954.0], [6.3, 3976.0], [6.4, 3997.0], [6.5, 4011.0], [6.6, 4038.0], [6.7, 4055.0], [6.8, 4073.0], [6.9, 4081.0], [7.0, 4087.0], [7.1, 4102.0], [7.2, 4108.0], [7.3, 4115.0], [7.4, 4130.0], [7.5, 4158.0], [7.6, 4159.0], [7.7, 4167.0], [7.8, 4190.0], [7.9, 4195.0], [8.0, 4209.0], [8.1, 4215.0], [8.2, 4222.0], [8.3, 4245.0], [8.4, 4257.0], [8.5, 4273.0], [8.6, 4291.0], [8.7, 4315.0], [8.8, 4330.0], [8.9, 4346.0], [9.0, 4364.0], [9.1, 4376.0], [9.2, 4436.0], [9.3, 4448.0], [9.4, 4457.0], [9.5, 4467.0], [9.6, 4469.0], [9.7, 4489.0], [9.8, 4504.0], [9.9, 4507.0], [10.0, 4525.0], [10.1, 4526.0], [10.2, 4532.0], [10.3, 4542.0], [10.4, 4552.0], [10.5, 4567.0], [10.6, 4583.0], [10.7, 4603.0], [10.8, 4626.0], [10.9, 4639.0], [11.0, 4642.0], [11.1, 4661.0], [11.2, 4689.0], [11.3, 4705.0], [11.4, 4726.0], [11.5, 4745.0], [11.6, 4753.0], [11.7, 4762.0], [11.8, 4775.0], [11.9, 4787.0], [12.0, 4800.0], [12.1, 4838.0], [12.2, 4853.0], [12.3, 4889.0], [12.4, 4917.0], [12.5, 4936.0], [12.6, 4941.0], [12.7, 4989.0], [12.8, 5006.0], [12.9, 5027.0], [13.0, 5077.0], [13.1, 5094.0], [13.2, 5164.0], [13.3, 5208.0], [13.4, 5223.0], [13.5, 5258.0], [13.6, 5317.0], [13.7, 5339.0], [13.8, 5354.0], [13.9, 5381.0], [14.0, 5401.0], [14.1, 5428.0], [14.2, 5458.0], [14.3, 5497.0], [14.4, 5516.0], [14.5, 5535.0], [14.6, 5610.0], [14.7, 5648.0], [14.8, 5655.0], [14.9, 5665.0], [15.0, 5692.0], [15.1, 5721.0], [15.2, 5747.0], [15.3, 5774.0], [15.4, 5799.0], [15.5, 5804.0], [15.6, 5815.0], [15.7, 5864.0], [15.8, 5871.0], [15.9, 5914.0], [16.0, 5924.0], [16.1, 5933.0], [16.2, 5984.0], [16.3, 5990.0], [16.4, 6062.0], [16.5, 6100.0], [16.6, 6119.0], [16.7, 6146.0], [16.8, 6189.0], [16.9, 6268.0], [17.0, 6328.0], [17.1, 6376.0], [17.2, 6388.0], [17.3, 6426.0], [17.4, 6429.0], [17.5, 6486.0], [17.6, 6488.0], [17.7, 6499.0], [17.8, 6512.0], [17.9, 6520.0], [18.0, 6542.0], [18.1, 6569.0], [18.2, 6573.0], [18.3, 6596.0], [18.4, 6605.0], [18.5, 6627.0], [18.6, 6637.0], [18.7, 6658.0], [18.8, 6667.0], [18.9, 6674.0], [19.0, 6706.0], [19.1, 6714.0], [19.2, 6730.0], [19.3, 6761.0], [19.4, 6774.0], [19.5, 6796.0], [19.6, 6834.0], [19.7, 6869.0], [19.8, 6892.0], [19.9, 6918.0], [20.0, 6937.0], [20.1, 6950.0], [20.2, 6964.0], [20.3, 6989.0], [20.4, 7012.0], [20.5, 7032.0], [20.6, 7050.0], [20.7, 7058.0], [20.8, 7077.0], [20.9, 7115.0], [21.0, 7134.0], [21.1, 7158.0], [21.2, 7186.0], [21.3, 7196.0], [21.4, 7216.0], [21.5, 7233.0], [21.6, 7245.0], [21.7, 7284.0], [21.8, 7290.0], [21.9, 7295.0], [22.0, 7305.0], [22.1, 7325.0], [22.2, 7379.0], [22.3, 7397.0], [22.4, 7422.0], [22.5, 7435.0], [22.6, 7452.0], [22.7, 7465.0], [22.8, 7488.0], [22.9, 7494.0], [23.0, 7498.0], [23.1, 7525.0], [23.2, 7539.0], [23.3, 7551.0], [23.4, 7570.0], [23.5, 7592.0], [23.6, 7614.0], [23.7, 7630.0], [23.8, 7647.0], [23.9, 7671.0], [24.0, 7700.0], [24.1, 7704.0], [24.2, 7708.0], [24.3, 7723.0], [24.4, 7732.0], [24.5, 7742.0], [24.6, 7748.0], [24.7, 7765.0], [24.8, 7776.0], [24.9, 7788.0], [25.0, 7813.0], [25.1, 7826.0], [25.2, 7844.0], [25.3, 7846.0], [25.4, 7857.0], [25.5, 7867.0], [25.6, 7875.0], [25.7, 7877.0], [25.8, 7878.0], [25.9, 7888.0], [26.0, 7901.0], [26.1, 7908.0], [26.2, 7916.0], [26.3, 7926.0], [26.4, 7934.0], [26.5, 7944.0], [26.6, 7960.0], [26.7, 7980.0], [26.8, 7995.0], [26.9, 8008.0], [27.0, 8023.0], [27.1, 8032.0], [27.2, 8054.0], [27.3, 8060.0], [27.4, 8087.0], [27.5, 8127.0], [27.6, 8138.0], [27.7, 8151.0], [27.8, 8170.0], [27.9, 8187.0], [28.0, 8193.0], [28.1, 8197.0], [28.2, 8204.0], [28.3, 8213.0], [28.4, 8238.0], [28.5, 8268.0], [28.6, 8302.0], [28.7, 8309.0], [28.8, 8317.0], [28.9, 8328.0], [29.0, 8340.0], [29.1, 8346.0], [29.2, 8353.0], [29.3, 8358.0], [29.4, 8367.0], [29.5, 8379.0], [29.6, 8398.0], [29.7, 8404.0], [29.8, 8423.0], [29.9, 8429.0], [30.0, 8449.0], [30.1, 8461.0], [30.2, 8470.0], [30.3, 8483.0], [30.4, 8500.0], [30.5, 8519.0], [30.6, 8528.0], [30.7, 8534.0], [30.8, 8539.0], [30.9, 8554.0], [31.0, 8561.0], [31.1, 8574.0], [31.2, 8590.0], [31.3, 8599.0], [31.4, 8611.0], [31.5, 8629.0], [31.6, 8638.0], [31.7, 8646.0], [31.8, 8667.0], [31.9, 8680.0], [32.0, 8683.0], [32.1, 8715.0], [32.2, 8726.0], [32.3, 8732.0], [32.4, 8739.0], [32.5, 8742.0], [32.6, 8754.0], [32.7, 8767.0], [32.8, 8780.0], [32.9, 8809.0], [33.0, 8819.0], [33.1, 8855.0], [33.2, 8863.0], [33.3, 8897.0], [33.4, 8951.0], [33.5, 8989.0], [33.6, 9012.0], [33.7, 9051.0], [33.8, 9082.0], [33.9, 9096.0], [34.0, 9134.0], [34.1, 9146.0], [34.2, 9160.0], [34.3, 9182.0], [34.4, 9211.0], [34.5, 9240.0], [34.6, 9262.0], [34.7, 9286.0], [34.8, 9306.0], [34.9, 9336.0], [35.0, 9354.0], [35.1, 9401.0], [35.2, 9418.0], [35.3, 9452.0], [35.4, 9481.0], [35.5, 9503.0], [35.6, 9519.0], [35.7, 9531.0], [35.8, 9543.0], [35.9, 9552.0], [36.0, 9573.0], [36.1, 9590.0], [36.2, 9596.0], [36.3, 9602.0], [36.4, 9613.0], [36.5, 9624.0], [36.6, 9640.0], [36.7, 9641.0], [36.8, 9647.0], [36.9, 9663.0], [37.0, 9682.0], [37.1, 9695.0], [37.2, 9710.0], [37.3, 9730.0], [37.4, 9740.0], [37.5, 9743.0], [37.6, 9755.0], [37.7, 9768.0], [37.8, 9790.0], [37.9, 9815.0], [38.0, 9829.0], [38.1, 9867.0], [38.2, 9885.0], [38.3, 9913.0], [38.4, 9920.0], [38.5, 9936.0], [38.6, 9942.0], [38.7, 9953.0], [38.8, 9967.0], [38.9, 9987.0], [39.0, 9993.0], [39.1, 10044.0], [39.2, 10057.0], [39.3, 10069.0], [39.4, 10082.0], [39.5, 10090.0], [39.6, 10100.0], [39.7, 10105.0], [39.8, 10117.0], [39.9, 10154.0], [40.0, 10165.0], [40.1, 10180.0], [40.2, 10191.0], [40.3, 10206.0], [40.4, 10223.0], [40.5, 10259.0], [40.6, 10264.0], [40.7, 10280.0], [40.8, 10306.0], [40.9, 10318.0], [41.0, 10336.0], [41.1, 10341.0], [41.2, 10345.0], [41.3, 10362.0], [41.4, 10381.0], [41.5, 10395.0], [41.6, 10404.0], [41.7, 10421.0], [41.8, 10440.0], [41.9, 10450.0], [42.0, 10453.0], [42.1, 10478.0], [42.2, 10489.0], [42.3, 10491.0], [42.4, 10498.0], [42.5, 10506.0], [42.6, 10530.0], [42.7, 10571.0], [42.8, 10580.0], [42.9, 10586.0], [43.0, 10595.0], [43.1, 10598.0], [43.2, 10607.0], [43.3, 10613.0], [43.4, 10618.0], [43.5, 10623.0], [43.6, 10638.0], [43.7, 10654.0], [43.8, 10676.0], [43.9, 10691.0], [44.0, 10709.0], [44.1, 10721.0], [44.2, 10729.0], [44.3, 10748.0], [44.4, 10773.0], [44.5, 10786.0], [44.6, 10801.0], [44.7, 10824.0], [44.8, 10834.0], [44.9, 10840.0], [45.0, 10850.0], [45.1, 10860.0], [45.2, 10864.0], [45.3, 10879.0], [45.4, 10889.0], [45.5, 10899.0], [45.6, 10905.0], [45.7, 10915.0], [45.8, 10923.0], [45.9, 10940.0], [46.0, 10949.0], [46.1, 10973.0], [46.2, 10999.0], [46.3, 11005.0], [46.4, 11028.0], [46.5, 11049.0], [46.6, 11053.0], [46.7, 11065.0], [46.8, 11071.0], [46.9, 11093.0], [47.0, 11101.0], [47.1, 11121.0], [47.2, 11144.0], [47.3, 11165.0], [47.4, 11192.0], [47.5, 11215.0], [47.6, 11222.0], [47.7, 11230.0], [47.8, 11242.0], [47.9, 11248.0], [48.0, 11260.0], [48.1, 11270.0], [48.2, 11275.0], [48.3, 11295.0], [48.4, 11310.0], [48.5, 11332.0], [48.6, 11358.0], [48.7, 11378.0], [48.8, 11395.0], [48.9, 11428.0], [49.0, 11443.0], [49.1, 11485.0], [49.2, 11509.0], [49.3, 11537.0], [49.4, 11546.0], [49.5, 11562.0], [49.6, 11576.0], [49.7, 11584.0], [49.8, 11611.0], [49.9, 11626.0], [50.0, 11652.0], [50.1, 11661.0], [50.2, 11685.0], [50.3, 11698.0], [50.4, 11727.0], [50.5, 11745.0], [50.6, 11761.0], [50.7, 11787.0], [50.8, 11812.0], [50.9, 11844.0], [51.0, 11858.0], [51.1, 11882.0], [51.2, 11912.0], [51.3, 11929.0], [51.4, 11933.0], [51.5, 11949.0], [51.6, 11959.0], [51.7, 11981.0], [51.8, 11999.0], [51.9, 12006.0], [52.0, 12009.0], [52.1, 12027.0], [52.2, 12049.0], [52.3, 12084.0], [52.4, 12098.0], [52.5, 12133.0], [52.6, 12153.0], [52.7, 12161.0], [52.8, 12167.0], [52.9, 12202.0], [53.0, 12219.0], [53.1, 12255.0], [53.2, 12262.0], [53.3, 12272.0], [53.4, 12323.0], [53.5, 12329.0], [53.6, 12341.0], [53.7, 12353.0], [53.8, 12363.0], [53.9, 12376.0], [54.0, 12395.0], [54.1, 12424.0], [54.2, 12439.0], [54.3, 12452.0], [54.4, 12482.0], [54.5, 12489.0], [54.6, 12504.0], [54.7, 12511.0], [54.8, 12528.0], [54.9, 12542.0], [55.0, 12546.0], [55.1, 12570.0], [55.2, 12594.0], [55.3, 12613.0], [55.4, 12621.0], [55.5, 12651.0], [55.6, 12664.0], [55.7, 12684.0], [55.8, 12710.0], [55.9, 12713.0], [56.0, 12719.0], [56.1, 12734.0], [56.2, 12745.0], [56.3, 12763.0], [56.4, 12774.0], [56.5, 12782.0], [56.6, 12800.0], [56.7, 12807.0], [56.8, 12816.0], [56.9, 12824.0], [57.0, 12848.0], [57.1, 12852.0], [57.2, 12859.0], [57.3, 12875.0], [57.4, 12879.0], [57.5, 12889.0], [57.6, 12906.0], [57.7, 12912.0], [57.8, 12944.0], [57.9, 12967.0], [58.0, 12996.0], [58.1, 13002.0], [58.2, 13006.0], [58.3, 13017.0], [58.4, 13030.0], [58.5, 13040.0], [58.6, 13061.0], [58.7, 13071.0], [58.8, 13084.0], [58.9, 13093.0], [59.0, 13097.0], [59.1, 13124.0], [59.2, 13136.0], [59.3, 13149.0], [59.4, 13157.0], [59.5, 13162.0], [59.6, 13166.0], [59.7, 13186.0], [59.8, 13195.0], [59.9, 13207.0], [60.0, 13226.0], [60.1, 13240.0], [60.2, 13256.0], [60.3, 13270.0], [60.4, 13274.0], [60.5, 13290.0], [60.6, 13316.0], [60.7, 13327.0], [60.8, 13336.0], [60.9, 13344.0], [61.0, 13348.0], [61.1, 13357.0], [61.2, 13365.0], [61.3, 13371.0], [61.4, 13411.0], [61.5, 13424.0], [61.6, 13450.0], [61.7, 13466.0], [61.8, 13482.0], [61.9, 13496.0], [62.0, 13512.0], [62.1, 13540.0], [62.2, 13549.0], [62.3, 13557.0], [62.4, 13582.0], [62.5, 13607.0], [62.6, 13642.0], [62.7, 13656.0], [62.8, 13674.0], [62.9, 13676.0], [63.0, 13686.0], [63.1, 13707.0], [63.2, 13714.0], [63.3, 13729.0], [63.4, 13743.0], [63.5, 13765.0], [63.6, 13770.0], [63.7, 13777.0], [63.8, 13786.0], [63.9, 13799.0], [64.0, 13816.0], [64.1, 13832.0], [64.2, 13859.0], [64.3, 13871.0], [64.4, 13893.0], [64.5, 13927.0], [64.6, 13936.0], [64.7, 13941.0], [64.8, 13974.0], [64.9, 14002.0], [65.0, 14016.0], [65.1, 14037.0], [65.2, 14049.0], [65.3, 14072.0], [65.4, 14092.0], [65.5, 14107.0], [65.6, 14118.0], [65.7, 14131.0], [65.8, 14143.0], [65.9, 14182.0], [66.0, 14213.0], [66.1, 14223.0], [66.2, 14249.0], [66.3, 14271.0], [66.4, 14308.0], [66.5, 14334.0], [66.6, 14367.0], [66.7, 14427.0], [66.8, 14465.0], [66.9, 14492.0], [67.0, 14506.0], [67.1, 14542.0], [67.2, 14569.0], [67.3, 14596.0], [67.4, 14605.0], [67.5, 14645.0], [67.6, 14675.0], [67.7, 14730.0], [67.8, 14753.0], [67.9, 14781.0], [68.0, 14826.0], [68.1, 14867.0], [68.2, 14889.0], [68.3, 14947.0], [68.4, 14980.0], [68.5, 15021.0], [68.6, 15049.0], [68.7, 15103.0], [68.8, 15141.0], [68.9, 15243.0], [69.0, 15263.0], [69.1, 15277.0], [69.2, 15304.0], [69.3, 15334.0], [69.4, 15364.0], [69.5, 15379.0], [69.6, 15420.0], [69.7, 15483.0], [69.8, 15508.0], [69.9, 15521.0], [70.0, 15563.0], [70.1, 15582.0], [70.2, 15621.0], [70.3, 15683.0], [70.4, 15719.0], [70.5, 15736.0], [70.6, 15846.0], [70.7, 15948.0], [70.8, 15988.0], [70.9, 16026.0], [71.0, 16073.0], [71.1, 16101.0], [71.2, 16155.0], [71.3, 16253.0], [71.4, 16297.0], [71.5, 16343.0], [71.6, 16368.0], [71.7, 16419.0], [71.8, 16466.0], [71.9, 16483.0], [72.0, 16500.0], [72.1, 16634.0], [72.2, 16740.0], [72.3, 16845.0], [72.4, 16891.0], [72.5, 16953.0], [72.6, 17021.0], [72.7, 17063.0], [72.8, 17166.0], [72.9, 17209.0], [73.0, 17232.0], [73.1, 17273.0], [73.2, 17325.0], [73.3, 17388.0], [73.4, 17415.0], [73.5, 17449.0], [73.6, 17475.0], [73.7, 17529.0], [73.8, 17621.0], [73.9, 17722.0], [74.0, 17745.0], [74.1, 17787.0], [74.2, 17813.0], [74.3, 17848.0], [74.4, 17882.0], [74.5, 17975.0], [74.6, 17984.0], [74.7, 18010.0], [74.8, 18034.0], [74.9, 18056.0], [75.0, 18113.0], [75.1, 18141.0], [75.2, 18166.0], [75.3, 18183.0], [75.4, 18196.0], [75.5, 18220.0], [75.6, 18282.0], [75.7, 18297.0], [75.8, 18325.0], [75.9, 18349.0], [76.0, 18408.0], [76.1, 18443.0], [76.2, 18452.0], [76.3, 18471.0], [76.4, 18501.0], [76.5, 18540.0], [76.6, 18562.0], [76.7, 18602.0], [76.8, 18630.0], [76.9, 18654.0], [77.0, 18712.0], [77.1, 18775.0], [77.2, 18783.0], [77.3, 18813.0], [77.4, 18856.0], [77.5, 18875.0], [77.6, 18967.0], [77.7, 19015.0], [77.8, 19033.0], [77.9, 19045.0], [78.0, 19079.0], [78.1, 19130.0], [78.2, 19155.0], [78.3, 19200.0], [78.4, 19222.0], [78.5, 19254.0], [78.6, 19312.0], [78.7, 19349.0], [78.8, 19393.0], [78.9, 19436.0], [79.0, 19450.0], [79.1, 19495.0], [79.2, 19516.0], [79.3, 19562.0], [79.4, 19584.0], [79.5, 19603.0], [79.6, 19613.0], [79.7, 19639.0], [79.8, 19672.0], [79.9, 19677.0], [80.0, 19697.0], [80.1, 19738.0], [80.2, 19751.0], [80.3, 19791.0], [80.4, 19813.0], [80.5, 19825.0], [80.6, 19839.0], [80.7, 19848.0], [80.8, 19876.0], [80.9, 19904.0], [81.0, 19923.0], [81.1, 19962.0], [81.2, 19964.0], [81.3, 19976.0], [81.4, 20015.0], [81.5, 20026.0], [81.6, 20042.0], [81.7, 20053.0], [81.8, 20071.0], [81.9, 20093.0], [82.0, 20143.0], [82.1, 20158.0], [82.2, 20198.0], [82.3, 20215.0], [82.4, 20234.0], [82.5, 20238.0], [82.6, 20251.0], [82.7, 20259.0], [82.8, 20266.0], [82.9, 20269.0], [83.0, 20278.0], [83.1, 20282.0], [83.2, 20301.0], [83.3, 20312.0], [83.4, 20325.0], [83.5, 20331.0], [83.6, 20346.0], [83.7, 20363.0], [83.8, 20390.0], [83.9, 20406.0], [84.0, 20439.0], [84.1, 20461.0], [84.2, 20480.0], [84.3, 20499.0], [84.4, 20521.0], [84.5, 20548.0], [84.6, 20579.0], [84.7, 20615.0], [84.8, 20636.0], [84.9, 20678.0], [85.0, 20714.0], [85.1, 20746.0], [85.2, 20754.0], [85.3, 20765.0], [85.4, 20778.0], [85.5, 20786.0], [85.6, 20829.0], [85.7, 20839.0], [85.8, 20876.0], [85.9, 20883.0], [86.0, 20915.0], [86.1, 20924.0], [86.2, 20936.0], [86.3, 20947.0], [86.4, 20955.0], [86.5, 20964.0], [86.6, 20973.0], [86.7, 20998.0], [86.8, 21042.0], [86.9, 21059.0], [87.0, 21089.0], [87.1, 21099.0], [87.2, 21127.0], [87.3, 21149.0], [87.4, 21181.0], [87.5, 21196.0], [87.6, 21207.0], [87.7, 21245.0], [87.8, 21279.0], [87.9, 21301.0], [88.0, 21342.0], [88.1, 21387.0], [88.2, 21426.0], [88.3, 21442.0], [88.4, 21464.0], [88.5, 21476.0], [88.6, 21478.0], [88.7, 21507.0], [88.8, 21552.0], [88.9, 21567.0], [89.0, 21583.0], [89.1, 21622.0], [89.2, 21645.0], [89.3, 21669.0], [89.4, 21694.0], [89.5, 21714.0], [89.6, 21737.0], [89.7, 21797.0], [89.8, 21819.0], [89.9, 21894.0], [90.0, 21903.0], [90.1, 21925.0], [90.2, 21938.0], [90.3, 21966.0], [90.4, 22002.0], [90.5, 22030.0], [90.6, 22062.0], [90.7, 22082.0], [90.8, 22095.0], [90.9, 22140.0], [91.0, 22154.0], [91.1, 22197.0], [91.2, 22274.0], [91.3, 22291.0], [91.4, 22300.0], [91.5, 22338.0], [91.6, 22344.0], [91.7, 22376.0], [91.8, 22387.0], [91.9, 22413.0], [92.0, 22465.0], [92.1, 22472.0], [92.2, 22511.0], [92.3, 22535.0], [92.4, 22551.0], [92.5, 22572.0], [92.6, 22600.0], [92.7, 22643.0], [92.8, 22644.0], [92.9, 22701.0], [93.0, 22728.0], [93.1, 22740.0], [93.2, 22792.0], [93.3, 22805.0], [93.4, 22869.0], [93.5, 22891.0], [93.6, 22923.0], [93.7, 22939.0], [93.8, 23018.0], [93.9, 23117.0], [94.0, 23185.0], [94.1, 23208.0], [94.2, 23290.0], [94.3, 23321.0], [94.4, 23350.0], [94.5, 23376.0], [94.6, 23397.0], [94.7, 23443.0], [94.8, 23486.0], [94.9, 23498.0], [95.0, 23537.0], [95.1, 23593.0], [95.2, 23619.0], [95.3, 23677.0], [95.4, 23738.0], [95.5, 23767.0], [95.6, 23817.0], [95.7, 23830.0], [95.8, 23844.0], [95.9, 23881.0], [96.0, 23975.0], [96.1, 23983.0], [96.2, 24024.0], [96.3, 24037.0], [96.4, 24045.0], [96.5, 24068.0], [96.6, 24086.0], [96.7, 24133.0], [96.8, 24153.0], [96.9, 24192.0], [97.0, 24252.0], [97.1, 24341.0], [97.2, 24390.0], [97.3, 24450.0], [97.4, 24481.0], [97.5, 24550.0], [97.6, 24593.0], [97.7, 24641.0], [97.8, 24689.0], [97.9, 24727.0], [98.0, 24788.0], [98.1, 24878.0], [98.2, 24891.0], [98.3, 24966.0], [98.4, 24993.0], [98.5, 25024.0], [98.6, 25065.0], [98.7, 25129.0], [98.8, 25160.0], [98.9, 25353.0], [99.0, 25433.0], [99.1, 25494.0], [99.2, 25558.0], [99.3, 25617.0], [99.4, 25671.0], [99.5, 25772.0], [99.6, 25828.0], [99.7, 26014.0], [99.8, 26089.0], [99.9, 26240.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 700.0, "maxY": 31.0, "series": [{"data": [[700.0, 4.0], [1300.0, 2.0], [1400.0, 5.0], [1500.0, 8.0], [1600.0, 5.0], [1700.0, 3.0], [1800.0, 4.0], [1900.0, 5.0], [2100.0, 10.0], [2200.0, 3.0], [2300.0, 1.0], [2400.0, 7.0], [2500.0, 2.0], [2600.0, 3.0], [2700.0, 10.0], [2800.0, 6.0], [2900.0, 1.0], [3000.0, 7.0], [3100.0, 4.0], [3300.0, 7.0], [3200.0, 5.0], [3400.0, 9.0], [3500.0, 12.0], [3600.0, 15.0], [3700.0, 15.0], [3800.0, 16.0], [3900.0, 24.0], [4000.0, 20.0], [4100.0, 25.0], [4200.0, 22.0], [4300.0, 16.0], [4400.0, 17.0], [4500.0, 27.0], [4600.0, 17.0], [4700.0, 23.0], [4800.0, 10.0], [4900.0, 13.0], [5000.0, 11.0], [5100.0, 4.0], [5300.0, 13.0], [5200.0, 9.0], [5400.0, 10.0], [5600.0, 13.0], [5500.0, 8.0], [5800.0, 13.0], [5700.0, 12.0], [5900.0, 14.0], [6100.0, 11.0], [6000.0, 5.0], [6300.0, 8.0], [6200.0, 2.0], [6500.0, 19.0], [6400.0, 15.0], [6600.0, 18.0], [6700.0, 17.0], [6900.0, 13.0], [6800.0, 11.0], [7100.0, 14.0], [7000.0, 16.0], [7200.0, 19.0], [7400.0, 21.0], [7300.0, 11.0], [7500.0, 16.0], [7600.0, 13.0], [7700.0, 29.0], [7800.0, 30.0], [7900.0, 27.0], [8000.0, 18.0], [8100.0, 21.0], [8300.0, 31.0], [8400.0, 23.0], [8500.0, 28.0], [8600.0, 23.0], [8700.0, 22.0], [8200.0, 13.0], [8800.0, 15.0], [8900.0, 8.0], [9100.0, 13.0], [9000.0, 10.0], [9200.0, 11.0], [9300.0, 11.0], [9400.0, 11.0], [9600.0, 25.0], [9500.0, 25.0], [9700.0, 23.0], [9800.0, 12.0], [10000.0, 17.0], [9900.0, 22.0], [10100.0, 21.0], [10200.0, 14.0], [10300.0, 25.0], [10600.0, 26.0], [10400.0, 25.0], [10500.0, 21.0], [10700.0, 17.0], [10800.0, 29.0], [10900.0, 21.0], [11000.0, 23.0], [11100.0, 14.0], [11200.0, 27.0], [11300.0, 14.0], [11400.0, 11.0], [11600.0, 17.0], [11500.0, 18.0], [11700.0, 13.0], [11800.0, 13.0], [11900.0, 19.0], [12000.0, 18.0], [12200.0, 15.0], [12100.0, 14.0], [12300.0, 20.0], [12400.0, 15.0], [12700.0, 24.0], [12500.0, 21.0], [12600.0, 16.0], [12800.0, 28.0], [12900.0, 16.0], [13000.0, 30.0], [13200.0, 19.0], [13100.0, 25.0], [13300.0, 26.0], [13400.0, 18.0], [13600.0, 17.0], [13500.0, 15.0], [13800.0, 15.0], [13700.0, 26.0], [14200.0, 13.0], [14300.0, 10.0], [13900.0, 14.0], [14100.0, 14.0], [14000.0, 17.0], [14500.0, 11.0], [14600.0, 9.0], [14800.0, 8.0], [14700.0, 11.0], [14400.0, 8.0], [14900.0, 5.0], [15000.0, 8.0], [15300.0, 10.0], [15200.0, 9.0], [15100.0, 6.0], [15500.0, 13.0], [15700.0, 7.0], [15600.0, 4.0], [15400.0, 7.0], [15800.0, 3.0], [16000.0, 7.0], [16200.0, 6.0], [16100.0, 4.0], [16300.0, 8.0], [15900.0, 6.0], [17200.0, 9.0], [16400.0, 9.0], [16800.0, 6.0], [17000.0, 7.0], [17400.0, 10.0], [16600.0, 4.0], [18400.0, 13.0], [18000.0, 8.0], [18200.0, 10.0], [17800.0, 7.0], [17600.0, 3.0], [18600.0, 9.0], [19400.0, 10.0], [19200.0, 9.0], [19000.0, 13.0], [18800.0, 7.0], [20000.0, 16.0], [19600.0, 16.0], [20400.0, 13.0], [19800.0, 17.0], [20200.0, 29.0], [20600.0, 9.0], [21200.0, 11.0], [20800.0, 12.0], [21000.0, 11.0], [21400.0, 15.0], [21600.0, 11.0], [21800.0, 7.0], [22400.0, 10.0], [22000.0, 13.0], [22200.0, 8.0], [22800.0, 9.0], [22600.0, 9.0], [23400.0, 9.0], [23200.0, 4.0], [23000.0, 4.0], [23600.0, 5.0], [23800.0, 10.0], [24000.0, 16.0], [24400.0, 6.0], [24200.0, 3.0], [25000.0, 6.0], [24600.0, 6.0], [24800.0, 6.0], [25400.0, 6.0], [25200.0, 1.0], [25600.0, 4.0], [25800.0, 3.0], [26000.0, 4.0], [26200.0, 1.0], [16900.0, 4.0], [16500.0, 2.0], [17100.0, 3.0], [17300.0, 4.0], [16700.0, 1.0], [17700.0, 9.0], [18100.0, 15.0], [18300.0, 6.0], [17500.0, 4.0], [17900.0, 7.0], [19100.0, 6.0], [18700.0, 9.0], [18900.0, 4.0], [18500.0, 9.0], [19300.0, 7.0], [19500.0, 10.0], [19700.0, 9.0], [19900.0, 15.0], [20300.0, 21.0], [20100.0, 9.0], [20500.0, 11.0], [20700.0, 17.0], [20900.0, 24.0], [21100.0, 12.0], [21300.0, 8.0], [21500.0, 12.0], [21700.0, 9.0], [21900.0, 13.0], [22300.0, 14.0], [22500.0, 12.0], [22100.0, 9.0], [22700.0, 12.0], [22900.0, 5.0], [23300.0, 12.0], [23500.0, 7.0], [23100.0, 6.0], [23700.0, 8.0], [23900.0, 6.0], [24100.0, 8.0], [24500.0, 6.0], [24300.0, 7.0], [24700.0, 5.0], [24900.0, 7.0], [25100.0, 5.0], [25500.0, 4.0], [25300.0, 3.0], [25700.0, 4.0], [26300.0, 2.0], [26100.0, 2.0], [25900.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 26300.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 11.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2989.0, "series": [{"data": [[1.0, 11.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[2.0, 2989.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 738.0277966101692, "minX": 1.54961874E12, "maxY": 1634.2563934426228, "series": [{"data": [[1.54961874E12, 1634.2563934426228], [1.5496188E12, 738.0277966101692]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496188E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 1758.0, "minX": 1.0, "maxY": 26329.0, "series": [{"data": [[2.0, 25433.0], [3.0, 21262.0], [4.0, 20971.0], [5.0, 20924.0], [6.0, 20926.0], [7.0, 24823.0], [8.0, 23376.0], [9.0, 20947.0], [10.0, 23188.0], [11.0, 25955.0], [12.0, 20248.0], [13.0, 20270.0], [14.0, 20332.0], [15.0, 25812.0], [16.0, 20348.0], [17.0, 20289.0], [18.0, 20279.0], [19.0, 20330.0], [20.0, 20253.0], [21.0, 21910.0], [22.0, 23497.0], [24.0, 21694.0], [25.0, 20309.0], [26.0, 22197.0], [27.0, 25353.0], [28.0, 25854.0], [29.0, 20280.0], [30.0, 20327.0], [31.0, 23909.0], [33.0, 25024.0], [32.0, 25065.0], [35.0, 20331.0], [34.0, 20227.0], [37.0, 20748.0], [36.0, 21109.0], [39.0, 24304.0], [38.0, 23436.0], [41.0, 26145.0], [40.0, 20282.0], [43.0, 20325.0], [42.0, 23983.0], [45.0, 24118.0], [44.0, 23276.0], [47.0, 25210.0], [46.0, 21477.0], [49.0, 23854.0], [48.0, 20238.0], [51.0, 23767.0], [50.0, 24693.0], [53.0, 20198.0], [52.0, 24192.0], [55.0, 24217.0], [57.0, 25170.0], [56.0, 20785.0], [59.0, 21429.0], [61.0, 23949.0], [60.0, 20269.0], [63.0, 24252.0], [62.0, 20215.0], [67.0, 20269.0], [66.0, 26088.0], [65.0, 24341.0], [64.0, 23054.0], [71.0, 20967.0], [70.0, 22547.0], [69.0, 20288.0], [68.0, 22728.0], [75.0, 20262.0], [74.0, 21540.0], [73.0, 22612.0], [72.0, 20212.0], [79.0, 26240.0], [78.0, 25471.0], [77.0, 22300.0], [76.0, 20749.0], [83.0, 24878.0], [82.0, 22030.0], [81.0, 23495.0], [80.0, 26329.0], [87.0, 22147.0], [86.0, 20480.0], [85.0, 21734.0], [84.0, 24041.0], [91.0, 24135.0], [90.0, 23729.0], [89.0, 22263.0], [88.0, 24550.0], [95.0, 22795.0], [94.0, 21097.0], [93.0, 25378.0], [92.0, 20714.0], [99.0, 25593.0], [98.0, 26136.0], [97.0, 24966.0], [96.0, 24490.0], [103.0, 21935.0], [102.0, 25129.0], [101.0, 26321.0], [100.0, 21904.0], [107.0, 21420.0], [106.0, 20251.5], [104.0, 20562.0], [111.0, 23193.0], [110.0, 22291.0], [109.0, 24641.0], [108.0, 22923.0], [115.0, 20616.0], [114.0, 20312.0], [113.0, 24425.0], [112.0, 25497.0], [119.0, 22050.0], [118.0, 23467.0], [117.0, 21086.0], [116.0, 25595.0], [123.0, 21797.0], [122.0, 21512.0], [121.0, 23331.0], [120.0, 20105.0], [127.0, 20878.0], [126.0, 22343.0], [125.0, 20791.0], [124.0, 20065.0], [135.0, 22720.0], [134.0, 20962.0], [133.0, 24672.0], [132.0, 20023.0], [131.0, 20952.0], [130.0, 24959.0], [129.0, 21903.0], [128.0, 23619.0], [143.0, 20475.0], [142.0, 20581.0], [141.0, 24331.0], [140.0, 24032.0], [139.0, 24390.0], [138.0, 20831.0], [137.0, 25160.0], [136.0, 25558.0], [151.0, 21389.0], [150.0, 25014.0], [149.0, 23397.0], [148.0, 22869.0], [147.0, 20761.0], [146.0, 24382.0], [145.0, 26082.0], [144.0, 21894.0], [159.0, 11715.5], [158.0, 24610.0], [157.0, 25409.0], [156.0, 22955.0], [155.0, 20035.0], [154.0, 21641.0], [153.0, 26014.0], [152.0, 22140.0], [167.0, 22095.0], [166.0, 20678.0], [165.0, 20636.0], [164.0, 25703.0], [163.0, 26089.0], [162.0, 24036.0], [161.0, 19998.0], [160.0, 24516.0], [171.0, 12819.5], [175.0, 20070.0], [174.0, 20314.0], [173.0, 22127.0], [172.0, 23117.0], [170.0, 25484.0], [169.0, 23761.0], [168.0, 22523.0], [176.0, 8294.666666666668], [183.0, 25139.0], [182.0, 25828.0], [181.0, 22577.0], [180.0, 20723.0], [179.0, 19925.0], [178.0, 21567.0], [177.0, 21852.0], [191.0, 21301.0], [190.0, 25785.0], [189.0, 24398.0], [188.0, 21477.0], [187.0, 24590.0], [186.0, 22825.0], [185.0, 23490.0], [199.0, 23568.0], [198.0, 24024.0], [197.0, 20390.0], [196.0, 25322.0], [195.0, 23118.0], [194.0, 24450.0], [193.0, 22644.0], [192.0, 21584.0], [207.0, 20962.0], [206.0, 24835.0], [205.0, 24993.0], [204.0, 24065.0], [203.0, 23376.0], [202.0, 25149.0], [201.0, 23003.0], [200.0, 21106.0], [215.0, 24727.0], [214.0, 23502.0], [213.0, 21249.0], [212.0, 20690.0], [211.0, 25617.0], [210.0, 22002.0], [209.0, 25535.0], [208.0, 22082.0], [223.0, 24133.0], [222.0, 19801.0], [221.0, 20860.0], [220.0, 22644.0], [219.0, 24891.0], [218.0, 20234.0], [217.0, 21196.0], [216.0, 20268.0], [231.0, 25721.0], [230.0, 22575.0], [228.0, 21484.0], [227.0, 19923.0], [226.0, 25671.0], [225.0, 22744.0], [224.0, 20754.0], [239.0, 25106.0], [238.0, 22239.5], [236.0, 22477.0], [235.0, 25042.0], [234.0, 22100.0], [233.0, 25772.0], [232.0, 21200.0], [247.0, 22383.0], [246.0, 23500.0], [245.0, 23316.0], [244.0, 19691.0], [243.0, 24788.0], [242.0, 22289.0], [241.0, 19738.0], [240.0, 25648.0], [255.0, 23547.0], [254.0, 24459.0], [253.0, 22015.0], [252.0, 21737.0], [251.0, 24964.0], [250.0, 21438.0], [249.0, 23844.0], [248.0, 23830.0], [270.0, 21221.0], [271.0, 22733.0], [269.0, 20521.0], [268.0, 19676.0], [267.0, 19589.0], [266.0, 21928.0], [265.0, 20442.0], [264.0, 20810.0], [263.0, 21712.0], [257.0, 19964.0], [256.0, 25494.0], [259.0, 23064.0], [258.0, 21772.0], [262.0, 22088.0], [261.0, 22643.0], [260.0, 24057.0], [285.0, 21669.0], [287.0, 23628.0], [284.0, 22387.0], [275.0, 20778.0], [274.0, 21464.0], [273.0, 22317.0], [272.0, 19791.0], [283.0, 21659.0], [282.0, 20964.0], [281.0, 24478.0], [280.0, 25075.0], [279.0, 19677.0], [278.0, 22183.5], [276.0, 21042.0], [302.0, 23432.0], [303.0, 22085.0], [301.0, 21852.5], [291.0, 20214.0], [290.0, 20158.0], [289.0, 19899.0], [288.0, 24171.0], [299.0, 24019.0], [298.0, 21984.0], [297.0, 20346.0], [296.0, 24884.0], [295.0, 22750.0], [294.0, 19450.0], [293.0, 20434.0], [292.0, 20409.0], [318.0, 22177.0], [319.0, 22297.0], [317.0, 19976.0], [316.0, 24597.0], [315.0, 19765.0], [314.0, 19423.0], [313.0, 22308.0], [311.0, 21734.0], [305.0, 22521.0], [304.0, 22805.0], [307.0, 20439.0], [306.0, 22891.0], [310.0, 21645.0], [309.0, 24973.0], [308.0, 21329.0], [334.0, 19603.0], [335.0, 23208.0], [333.0, 23383.0], [332.0, 22566.0], [331.0, 19227.0], [330.0, 21567.0], [329.0, 22295.0], [328.0, 20271.0], [327.0, 24689.0], [321.0, 23018.0], [320.0, 20171.0], [323.0, 19495.0], [322.0, 20344.0], [326.0, 23978.0], [325.0, 24037.0], [324.0, 21129.0], [350.0, 19807.0], [351.0, 23826.0], [349.0, 24082.0], [348.0, 23977.0], [347.0, 22446.0], [346.0, 21099.0], [345.0, 19523.0], [344.0, 21975.0], [343.0, 23830.0], [337.0, 24176.0], [336.0, 20235.0], [339.0, 20387.0], [338.0, 21881.0], [342.0, 24045.0], [341.0, 23780.0], [340.0, 23253.0], [366.0, 12095.0], [357.0, 6837.0], [356.0, 8393.0], [358.0, 13257.0], [359.0, 24774.0], [355.0, 22203.0], [354.0, 20955.0], [353.0, 22551.0], [352.0, 20182.0], [363.0, 11847.0], [367.0, 19839.0], [361.0, 22643.0], [360.0, 21442.0], [365.0, 21583.0], [364.0, 23616.0], [362.0, 19136.0], [383.0, 23881.0], [369.0, 10300.5], [372.0, 10833.5], [373.0, 22604.0], [375.0, 23763.0], [368.0, 20278.0], [374.0, 24587.0], [376.0, 11024.5], [377.0, 21819.0], [381.0, 12678.0], [382.0, 22407.0], [380.0, 23290.0], [371.0, 22683.0], [370.0, 21552.0], [379.0, 24149.0], [378.0, 22338.0], [397.0, 20953.0], [393.0, 11994.0], [388.0, 8928.0], [390.0, 22879.0], [389.0, 19912.0], [394.0, 13198.5], [395.0, 10457.0], [398.0, 24098.0], [396.0, 19985.0], [387.0, 23598.0], [386.0, 20238.0], [385.0, 21577.5], [392.0, 21089.0], [391.0, 20683.0], [413.0, 24086.0], [400.0, 15769.333333333332], [402.0, 12074.0], [401.0, 22739.0], [406.0, 1758.0], [405.0, 21622.0], [404.0, 20042.0], [407.0, 14726.333333333334], [408.0, 13153.0], [409.0, 19841.0], [411.0, 19562.0], [410.0, 22891.0], [415.0, 18602.0], [414.0, 22078.0], [412.0, 21966.0], [403.0, 24251.0], [431.0, 21342.0], [427.0, 11469.0], [428.0, 11307.5], [419.0, 19508.0], [418.0, 21359.0], [417.0, 23621.0], [416.0, 21925.0], [430.0, 22939.0], [429.0, 22471.0], [426.0, 24153.0], [425.0, 24002.0], [424.0, 19203.0], [423.0, 24481.0], [422.0, 21603.0], [421.0, 23185.0], [420.0, 19613.0], [446.0, 11692.5], [445.0, 12648.5], [447.0, 21578.0], [444.0, 23486.0], [443.0, 18286.0], [442.0, 22447.0], [441.0, 20774.0], [440.0, 18379.0], [439.0, 22340.0], [433.0, 24079.0], [432.0, 21439.0], [435.0, 20087.0], [434.0, 20499.0], [438.0, 24041.0], [437.0, 21572.0], [436.0, 19876.0], [462.0, 23664.0], [449.0, 12477.0], [455.0, 12054.0], [448.0, 18562.0], [454.0, 23842.0], [453.0, 23498.0], [452.0, 18304.0], [463.0, 22483.0], [461.0, 20395.0], [460.0, 21476.0], [451.0, 23313.0], [450.0, 19676.0], [459.0, 20960.0], [457.0, 22701.0], [456.0, 20488.0], [479.0, 21070.0], [475.0, 11684.0], [476.0, 11771.5], [467.0, 19968.0], [466.0, 21387.0], [465.0, 23132.0], [464.0, 23975.0], [478.0, 22145.0], [477.0, 23738.0], [474.0, 22081.0], [473.0, 18276.0], [472.0, 19516.0], [471.0, 19096.0], [470.0, 20738.0], [469.0, 22811.0], [468.0, 18604.0], [495.0, 23677.0], [487.0, 12432.0], [485.0, 11892.0], [484.0, 19598.0], [486.0, 22535.0], [491.0, 10895.0], [494.0, 19968.0], [493.0, 20227.0], [492.0, 21714.0], [483.0, 19337.0], [482.0, 23842.0], [481.0, 22344.0], [480.0, 22359.0], [490.0, 19751.0], [489.0, 19813.0], [488.0, 18758.0], [510.0, 19269.0], [502.0, 11525.0], [501.0, 10135.0], [500.0, 18112.0], [508.0, 11171.5], [503.0, 17921.0], [497.0, 23387.0], [496.0, 19825.0], [499.0, 17815.0], [498.0, 22376.0], [511.0, 18145.0], [509.0, 23479.0], [507.0, 21925.0], [505.0, 22582.0], [504.0, 19691.0], [540.0, 20042.0], [526.0, 12288.0], [514.0, 21402.0], [512.0, 19342.0], [518.0, 18540.0], [516.0, 18131.0], [524.0, 18019.0], [522.0, 20071.0], [520.0, 19948.5], [542.0, 23350.0], [538.0, 18531.0], [536.0, 19746.0], [534.0, 19142.0], [532.0, 20340.0], [530.0, 17995.0], [528.0, 17653.0], [572.0, 19645.0], [546.0, 9808.5], [552.0, 7356.0], [558.0, 18471.0], [544.0, 21901.0], [556.0, 19840.0], [568.0, 7971.666666666667], [550.0, 18408.0], [548.0, 19923.0], [574.0, 22540.0], [570.0, 19832.0], [566.0, 17234.0], [564.0, 18037.0], [562.0, 20746.0], [560.0, 19568.0], [606.0, 10587.5], [598.0, 12450.5], [604.0, 22413.0], [602.0, 22798.0], [600.0, 19862.0], [582.0, 18867.0], [580.0, 17663.0], [578.0, 18297.0], [576.0, 21774.0], [596.0, 21096.0], [594.0, 20251.0], [592.0, 20546.0], [590.0, 19855.0], [588.0, 20259.0], [586.0, 18630.0], [584.0, 22467.0], [634.0, 17475.0], [618.0, 10980.0], [616.0, 19848.0], [636.0, 11415.5], [632.0, 20940.0], [614.0, 18975.0], [612.0, 22026.0], [610.0, 18451.0], [608.0, 21950.0], [630.0, 21011.0], [626.0, 18297.0], [624.0, 16694.0], [622.0, 20941.0], [620.0, 18837.0], [668.0, 17982.0], [642.0, 10998.0], [648.0, 11963.5], [650.0, 20023.0], [654.0, 19196.0], [640.0, 17792.0], [652.0, 16740.0], [664.0, 10037.0], [646.0, 22465.0], [644.0, 16466.0], [670.0, 20915.0], [666.0, 21938.0], [662.0, 20532.0], [660.0, 17975.0], [658.0, 16483.0], [656.0, 18501.0], [700.0, 18443.0], [676.0, 9743.0], [684.0, 11577.0], [674.0, 20015.0], [682.0, 18830.0], [680.0, 16662.0], [702.0, 16270.0], [698.0, 20786.0], [696.0, 20301.0], [678.0, 20083.0], [694.0, 21459.0], [692.0, 18779.0], [690.0, 19904.0], [688.0, 20042.0], [720.0, 16155.0], [734.0, 18543.0], [726.0, 10981.0], [724.0, 17722.0], [722.0, 21057.0], [732.0, 16238.0], [730.0, 20764.0], [728.0, 17325.0], [718.0, 18290.0], [706.0, 19672.0], [704.0, 18513.0], [710.0, 18783.0], [708.0, 17232.0], [716.0, 16473.0], [714.0, 18196.0], [712.0, 19254.0], [750.0, 16935.0], [748.0, 16520.0], [746.0, 17468.0], [744.0, 15936.0], [758.0, 8540.333333333332], [756.0, 17510.0], [754.0, 20839.0], [752.0, 17403.0], [760.0, 10569.0], [742.0, 18775.0], [740.0, 17427.0], [738.0, 17079.0], [736.0, 20779.0], [762.0, 21371.0], [766.0, 19004.0], [764.0, 16500.0], [768.0, 20876.0], [796.0, 9019.5], [778.0, 15636.0], [776.0, 15334.0], [780.0, 17021.0], [770.0, 21298.0], [782.0, 21149.0], [784.0, 15415.0], [786.0, 18875.0], [788.0, 19622.0], [790.0, 15508.0], [798.0, 19497.0], [794.0, 16053.0], [792.0, 18220.0], [774.0, 19604.0], [772.0, 15311.0], [800.0, 17872.0], [802.0, 8934.333333333332], [808.0, 17730.0], [810.0, 15103.0], [812.0, 15023.0], [814.0, 16386.0], [822.0, 11426.0], [820.0, 15742.0], [818.0, 20039.0], [816.0, 15563.0], [830.0, 17848.0], [828.0, 15719.0], [826.0, 20053.0], [824.0, 15491.0], [806.0, 15379.0], [804.0, 17477.0], [862.0, 20026.0], [858.0, 15416.5], [850.0, 8971.5], [852.0, 14511.0], [854.0, 15858.0], [848.0, 15988.0], [860.0, 18034.0], [856.0, 16343.0], [838.0, 15455.0], [836.0, 19382.0], [832.0, 17015.0], [846.0, 18967.0], [844.0, 14947.0], [842.0, 17984.0], [840.0, 17224.0], [866.0, 15019.0], [890.0, 8818.0], [870.0, 18788.0], [868.0, 18712.0], [888.0, 19015.0], [874.0, 9823.0], [872.0, 19470.0], [876.0, 19746.0], [864.0, 17273.0], [878.0, 14663.0], [884.0, 10836.5], [886.0, 17590.0], [892.0, 13832.0], [882.0, 14367.0], [880.0, 18010.0], [894.0, 14675.0], [898.0, 14427.0], [922.0, 7276.666666666666], [896.0, 14869.0], [900.0, 15251.0], [902.0, 16469.0], [920.0, 13674.0], [904.0, 13936.0], [906.0, 14238.0], [908.0, 19081.0], [910.0, 11016.0], [918.0, 18486.0], [916.0, 13936.0], [914.0, 15520.0], [912.0, 18025.0], [924.0, 19264.0], [926.0, 13729.0], [928.0, 13499.0], [934.0, 8615.0], [938.0, 13332.0], [936.0, 14602.0], [940.0, 13340.0], [930.0, 14287.0], [932.0, 14798.0], [942.0, 14548.0], [944.0, 8935.5], [946.0, 15711.0], [948.0, 14753.0], [950.0, 9033.5], [958.0, 13066.0], [956.0, 16011.0], [954.0, 14467.0], [952.0, 14049.0], [960.0, 13777.0], [984.0, 6925.333333333334], [964.0, 14037.0], [966.0, 13344.0], [970.0, 5712.833333333333], [968.0, 13195.0], [972.0, 13074.0], [962.0, 13097.0], [974.0, 13371.0], [976.0, 13336.0], [978.0, 14569.0], [980.0, 13547.0], [982.0, 12905.0], [990.0, 13411.0], [988.0, 14930.0], [986.0, 15542.0], [994.0, 12879.0], [1020.0, 13763.0], [998.0, 13279.0], [996.0, 14133.0], [992.0, 13719.0], [1006.0, 14835.0], [1004.0, 13538.0], [1002.0, 12850.0], [1000.0, 14171.0], [1008.0, 13674.0], [1010.0, 12967.0], [1012.0, 13874.0], [1014.0, 13758.0], [1022.0, 14034.0], [1018.0, 13314.0], [1016.0, 12940.0], [1036.0, 14302.0], [1024.0, 12852.0], [1028.0, 13676.0], [1048.0, 12506.0], [1044.0, 13166.0], [1040.0, 16602.0], [1072.0, 13647.0], [1032.0, 13071.0], [1076.0, 12850.0], [1056.0, 9706.0], [1060.0, 12853.0], [1084.0, 9015.5], [1064.0, 8328.0], [1068.0, 13222.0], [1080.0, 12739.0], [1092.0, 13698.0], [1144.0, 12011.0], [1088.0, 12167.0], [1116.0, 8031.5], [1104.0, 7073.0], [1108.0, 7078.333333333334], [1112.0, 13126.0], [1096.0, 6750.666666666666], [1100.0, 13025.0], [1136.0, 13013.0], [1148.0, 9671.0], [1140.0, 14025.5], [1120.0, 13239.0], [1124.0, 4248.0], [1128.0, 7928.5], [1132.0, 6791.666666666666], [1152.0, 8843.5], [1156.0, 6993.666666666666], [1180.0, 7204.0], [1168.0, 8777.5], [1172.0, 12351.0], [1176.0, 12036.0], [1164.0, 8795.5], [1160.0, 12787.5], [1204.0, 6798.0], [1200.0, 13318.0], [1208.0, 12570.0], [1184.0, 5484.666666666667], [1212.0, 13162.0], [1188.0, 8771.5], [1196.0, 12641.0], [1192.0, 6486.25], [1216.0, 8067.0], [1220.0, 8695.0], [1244.0, 8260.0], [1240.0, 8082.0], [1232.0, 9720.0], [1236.0, 7922.5], [1228.0, 7519.5], [1224.0, 14603.0], [1248.0, 12323.0], [1252.0, 14826.0], [1256.0, 13937.0], [1276.0, 13607.0], [1272.0, 11982.5], [1260.0, 8028.333333333334], [1268.0, 6878.0], [1264.0, 6943.0], [1288.0, 12087.0], [1284.0, 7482.25], [1280.0, 13482.0], [1308.0, 13512.0], [1304.0, 7308.666666666666], [1300.0, 7408.666666666666], [1292.0, 12103.0], [1332.0, 6733.166666666666], [1340.0, 7728.333333333334], [1336.0, 13346.0], [1312.0, 12823.0], [1328.0, 8803.666666666666], [1316.0, 8382.333333333334], [1320.0, 13676.0], [1324.0, 13002.0], [1296.0, 9012.0], [1348.0, 7946.0], [1352.0, 8232.0], [1368.0, 9759.5], [1364.0, 9816.0], [1360.0, 8533.0], [1344.0, 15340.0], [1372.0, 14372.0], [1356.0, 14773.0], [1392.0, 9790.5], [1396.0, 14208.0], [1400.0, 14645.0], [1404.0, 14958.0], [1376.0, 7878.666666666666], [1380.0, 13901.0], [1388.0, 11570.0], [1384.0, 8005.0], [1464.0, 12216.0], [1440.0, 13173.0], [1444.0, 11678.0], [1448.0, 12115.0], [1468.0, 10102.0], [1460.0, 11243.0], [1456.0, 10598.0], [1408.0, 12522.0], [1412.0, 12502.0], [1416.0, 12512.0], [1420.0, 13361.0], [1436.0, 13097.0], [1432.0, 10686.0], [1428.0, 13070.0], [1424.0, 11192.0], [1452.0, 10336.0], [1528.0, 10749.0], [1504.0, 9768.0], [1508.0, 12005.0], [1512.0, 11272.0], [1532.0, 11065.0], [1524.0, 9931.0], [1520.0, 9894.0], [1472.0, 10024.0], [1476.0, 10098.0], [1480.0, 12912.0], [1500.0, 12616.0], [1496.0, 12800.0], [1492.0, 13327.0], [1488.0, 10421.0], [1516.0, 10889.0], [1568.0, 6886.333333333334], [1596.0, 7667.5], [1576.0, 7523.75], [1580.0, 7291.333333333333], [1572.0, 7161.0], [1592.0, 9421.5], [1588.0, 9920.0], [1536.0, 10450.0], [1540.0, 11652.0], [1544.0, 10331.0], [1548.0, 9342.0], [1584.0, 10078.0], [1564.0, 7167.75], [1560.0, 8375.5], [1556.0, 11231.0], [1552.0, 10100.0], [1608.0, 9376.5], [1624.0, 9343.0], [1600.0, 9023.0], [1604.0, 12766.0], [1628.0, 8858.0], [1648.0, 9418.0], [1612.0, 9049.0], [1652.0, 10879.0], [1656.0, 11858.0], [1660.0, 10809.5], [1632.0, 10341.0], [1636.0, 7123.75], [1644.0, 12027.0], [1640.0, 9210.0], [1616.0, 8907.666666666666], [1620.0, 8768.5], [1668.0, 10773.0], [1676.0, 8385.0], [1720.0, 9960.0], [1672.0, 8152.0], [1664.0, 9588.0], [1692.0, 10067.0], [1688.0, 9240.0], [1684.0, 11270.0], [1680.0, 10259.0], [1712.0, 10206.0], [1724.0, 9168.5], [1704.0, 8014.0], [1708.0, 11997.0], [1696.0, 11093.0], [1700.0, 10069.0], [1716.0, 11173.0], [1736.0, 10611.0], [1740.0, 9113.5], [1788.0, 11247.0], [1760.0, 8946.5], [1732.0, 9354.0], [1728.0, 11934.0], [1776.0, 11393.0], [1784.0, 11181.0], [1744.0, 11406.0], [1748.0, 8054.0], [1752.0, 8127.0], [1756.0, 11242.0], [1768.0, 7704.5], [1764.0, 11745.0], [1772.0, 8135.333333333333], [1840.0, 8192.0], [1804.0, 8285.0], [1800.0, 11215.0], [1796.0, 9735.0], [1844.0, 10644.0], [1848.0, 10615.0], [1824.0, 10490.0], [1852.0, 10861.0], [1808.0, 9082.0], [1812.0, 10595.0], [1820.0, 10981.0], [1816.0, 10864.0], [1792.0, 7867.0], [1828.0, 5901.0], [1832.0, 10834.0], [1836.0, 10908.0], [1864.0, 10746.0], [1856.0, 8166.0], [1860.0, 10745.0], [1884.0, 10498.0], [1876.0, 9316.0], [1880.0, 10450.0], [1868.0, 9213.0], [1888.0, 8539.5], [1912.0, 10260.0], [1908.0, 10271.0], [1916.0, 10117.0], [1904.0, 8500.5], [1892.0, 10453.0], [1900.0, 7848.0], [1896.0, 10436.0], [1872.0, 8274.666666666666], [1928.0, 9091.0], [1932.0, 8565.0], [1920.0, 7457.0], [1948.0, 9820.0], [1924.0, 10069.0], [1968.0, 9627.0], [1952.0, 9854.0], [1956.0, 9613.0], [1960.0, 9695.0], [1964.0, 9672.0], [1976.0, 10342.0], [1972.0, 9640.0], [1980.0, 8474.5], [1936.0, 9790.0], [1940.0, 9913.0], [1944.0, 10891.0], [1988.0, 9543.0], [1992.0, 8565.5], [1984.0, 9519.0], [1996.0, 8583.5], [2032.0, 8398.0], [2004.0, 8640.0], [2000.0, 8683.0], [2008.0, 8616.0], [2012.0, 8596.0], [2020.0, 9190.0], [2016.0, 8287.0], [2044.0, 9130.0], [2040.0, 9624.0], [2036.0, 9819.0], [2024.0, 7845.0], [2028.0, 8427.0], [2048.0, 9300.0], [2056.0, 7923.666666666667], [2104.0, 7547.25], [2096.0, 7979.333333333333], [2088.0, 7699.0], [2080.0, 8553.0], [2064.0, 7607.0], [2072.0, 8047.0], [2144.0, 7579.75], [2160.0, 7231.0], [2168.0, 7196.0], [2120.0, 8500.0], [2112.0, 8574.0], [2128.0, 7774.666666666667], [2136.0, 8537.0], [2176.0, 7908.0], [2184.0, 8233.0], [2192.0, 8234.5], [2208.0, 8281.0], [2057.0, 8318.5], [2065.0, 8780.0], [2049.0, 8441.5], [2105.0, 7785.5], [2097.0, 7591.0], [2089.0, 7739.0], [2121.0, 8294.0], [2113.0, 8212.0], [2169.0, 7997.0], [2161.0, 8461.0], [2145.0, 8682.0], [2129.0, 8085.5], [2137.0, 8209.5], [2073.0, 7926.0], [2081.0, 7770.5], [2185.0, 7660.0], [2177.0, 7846.0], [2193.0, 7032.0], [2201.0, 7941.5], [2209.0, 6937.0], [1025.0, 8083.0], [1073.0, 9045.5], [1037.0, 8482.5], [1029.0, 12675.0], [1053.0, 12962.0], [1041.0, 13157.0], [1045.0, 13274.0], [1049.0, 6939.0], [1081.0, 8486.5], [1077.0, 8046.0], [1057.0, 7924.5], [1085.0, 13231.0], [1065.0, 6695.0], [1061.0, 13811.0], [1069.0, 13246.0], [1089.0, 9134.5], [1101.0, 8108.0], [1117.0, 13553.0], [1109.0, 7960.666666666667], [1105.0, 12940.0], [1113.0, 10259.0], [1097.0, 6577.333333333334], [1093.0, 10092.0], [1137.0, 13015.0], [1141.0, 11270.0], [1149.0, 13549.0], [1145.0, 13032.0], [1121.0, 5789.5], [1125.0, 8564.0], [1133.0, 6765.75], [1129.0, 13166.0], [1157.0, 7062.8], [1181.0, 7855.333333333334], [1153.0, 7261.666666666666], [1173.0, 8189.5], [1177.0, 7900.333333333334], [1169.0, 12424.0], [1161.0, 14487.0], [1213.0, 13223.0], [1209.0, 8451.0], [1189.0, 9427.0], [1193.0, 6941.0], [1197.0, 10035.0], [1165.0, 6431.333333333334], [1205.0, 15683.0], [1201.0, 12335.0], [1221.0, 6727.0], [1217.0, 8905.5], [1245.0, 16103.0], [1241.0, 7999.0], [1233.0, 14791.0], [1237.0, 7989.0], [1225.0, 9440.5], [1229.0, 13714.0], [1257.0, 10473.5], [1261.0, 6306.2], [1249.0, 9669.5], [1273.0, 9068.5], [1277.0, 12006.0], [1269.0, 10284.5], [1265.0, 6628.5], [1293.0, 9634.5], [1337.0, 7412.666666666666], [1285.0, 5840.375], [1281.0, 11879.0], [1305.0, 5928.428571428572], [1309.0, 13321.0], [1289.0, 11969.0], [1329.0, 8778.0], [1313.0, 12745.0], [1317.0, 15709.0], [1341.0, 14618.0], [1333.0, 8375.0], [1321.0, 6324.75], [1325.0, 13271.0], [1297.0, 7934.0], [1301.0, 15263.0], [1349.0, 8612.0], [1345.0, 9724.0], [1373.0, 8111.0], [1369.0, 12793.0], [1361.0, 13936.0], [1365.0, 9741.5], [1353.0, 9934.5], [1357.0, 6262.666666666667], [1393.0, 14889.0], [1397.0, 15049.0], [1401.0, 14588.0], [1405.0, 12049.0], [1377.0, 7206.333333333333], [1381.0, 12347.0], [1385.0, 8292.666666666666], [1389.0, 13582.0], [1465.0, 11661.0], [1441.0, 11929.0], [1445.0, 11219.0], [1449.0, 12664.0], [1469.0, 11844.0], [1461.0, 10057.0], [1457.0, 11230.0], [1409.0, 12774.0], [1413.0, 12428.0], [1417.0, 13805.0], [1421.0, 11059.0], [1437.0, 10999.0], [1433.0, 12482.0], [1429.0, 12326.0], [1425.0, 12024.0], [1453.0, 12797.0], [1529.0, 10494.0], [1505.0, 9774.0], [1509.0, 10671.0], [1513.0, 10488.0], [1533.0, 11101.0], [1525.0, 9631.0], [1521.0, 10748.0], [1473.0, 13256.0], [1477.0, 11011.0], [1481.0, 10591.0], [1485.0, 12014.0], [1501.0, 11626.0], [1497.0, 13354.0], [1493.0, 9663.0], [1489.0, 10055.0], [1517.0, 12713.0], [1597.0, 9164.0], [1573.0, 9250.5], [1577.0, 8876.0], [1581.0, 9721.0], [1569.0, 6780.666666666667], [1593.0, 9743.0], [1589.0, 12272.0], [1537.0, 11812.0], [1541.0, 11923.0], [1545.0, 9462.0], [1549.0, 10393.0], [1585.0, 10573.0], [1565.0, 6927.6], [1561.0, 7612.5], [1557.0, 9306.0], [1553.0, 12956.0], [1613.0, 12813.0], [1621.0, 8770.5], [1605.0, 10607.0], [1601.0, 10041.0], [1653.0, 5767.0], [1649.0, 10944.0], [1657.0, 9452.0], [1661.0, 8419.5], [1645.0, 11580.0], [1641.0, 10446.0], [1637.0, 9756.0], [1633.0, 10837.0], [1617.0, 7213.666666666667], [1625.0, 9951.0], [1629.0, 11842.0], [1669.0, 8384.0], [1665.0, 9030.0], [1673.0, 9262.0], [1677.0, 8897.0], [1713.0, 11121.0], [1717.0, 12035.0], [1681.0, 7682.0], [1685.0, 11773.0], [1689.0, 8978.5], [1693.0, 10841.0], [1697.0, 8064.5], [1701.0, 12202.0], [1705.0, 11537.0], [1709.0, 9692.0], [1725.0, 8467.0], [1721.0, 11254.0], [1757.0, 11654.0], [1789.0, 7865.0], [1785.0, 11225.0], [1749.0, 8642.5], [1745.0, 10339.0], [1753.0, 11272.0], [1781.0, 11606.5], [1777.0, 7610.0], [1741.0, 9879.0], [1737.0, 11465.0], [1733.0, 8391.0], [1729.0, 9602.0], [1761.0, 9035.5], [1765.0, 11583.0], [1769.0, 11509.0], [1773.0, 8953.0], [1841.0, 10473.0], [1801.0, 9300.0], [1797.0, 11165.0], [1805.0, 10884.0], [1845.0, 8332.0], [1849.0, 10335.0], [1825.0, 10825.0], [1853.0, 10596.0], [1809.0, 11248.0], [1813.0, 10726.0], [1821.0, 10840.0], [1817.0, 11004.0], [1793.0, 11443.0], [1829.0, 9567.333333333334], [1833.0, 10623.0], [1837.0, 10825.0], [1865.0, 9122.0], [1857.0, 10786.0], [1861.0, 10581.0], [1885.0, 10500.0], [1877.0, 10455.0], [1881.0, 10558.0], [1869.0, 10622.0], [1913.0, 7700.0], [1909.0, 10264.0], [1917.0, 10165.0], [1905.0, 8523.5], [1893.0, 9243.0], [1897.0, 10406.0], [1901.0, 8589.5], [1889.0, 8541.5], [1873.0, 7810.0], [1929.0, 10079.0], [1921.0, 8567.0], [1949.0, 10896.0], [1925.0, 10860.0], [1933.0, 9982.0], [1969.0, 9640.0], [1953.0, 9589.0], [1957.0, 9717.0], [1961.0, 9685.0], [1965.0, 10409.0], [1977.0, 9595.0], [1973.0, 9593.0], [1981.0, 8981.5], [1937.0, 9993.0], [1941.0, 8492.0], [1945.0, 9839.0], [1989.0, 9501.0], [2041.0, 8058.0], [2017.0, 7887.0], [1985.0, 10681.0], [1993.0, 8754.0], [1997.0, 8739.0], [2005.0, 9042.5], [2001.0, 9515.0], [2009.0, 9597.0], [2013.0, 8557.0], [2045.0, 8211.0], [2037.0, 8302.0], [2033.0, 8698.0], [2021.0, 8462.0], [2025.0, 9494.0], [2029.0, 7729.5], [2066.0, 7525.0], [2074.0, 7072.0], [2050.0, 7604.333333333333], [2106.0, 8194.5], [2090.0, 7716.0], [2098.0, 7596.5], [2082.0, 7598.75], [2058.0, 9233.0], [2146.0, 8150.0], [2154.0, 7929.6], [2162.0, 8449.0], [2170.0, 7752.5], [2122.0, 7465.0], [2114.0, 7539.0], [2130.0, 7961.0], [2138.0, 8754.0], [2186.0, 7259.5], [2178.0, 7115.0], [2194.0, 9073.5], [2202.0, 8423.0], [2210.0, 7872.5], [2051.0, 7871.0], [2107.0, 9087.0], [2091.0, 8659.0], [2099.0, 8104.75], [2067.0, 8181.0], [2059.0, 8994.0], [2115.0, 7529.0], [2171.0, 8192.5], [2163.0, 7825.5], [2155.0, 7825.75], [2147.0, 7670.5], [2123.0, 8076.333333333333], [2131.0, 7842.5], [2139.0, 7751.5], [2075.0, 8079.0], [2083.0, 8047.666666666667], [2179.0, 8741.0], [2195.0, 8311.0], [2187.0, 7064.0], [2203.0, 7593.0], [2211.0, 8134.0], [539.0, 20833.0], [543.0, 21279.0], [527.0, 9903.0], [533.0, 11249.0], [541.0, 19023.0], [537.0, 20563.0], [517.0, 21812.0], [515.0, 18856.0], [535.0, 22472.0], [529.0, 18282.0], [525.0, 17813.0], [523.0, 18485.0], [521.0, 22697.0], [575.0, 22924.0], [551.0, 12367.0], [559.0, 21896.0], [545.0, 18183.0], [549.0, 20391.0], [547.0, 20886.0], [557.0, 21059.0], [555.0, 19835.5], [553.0, 18856.0], [563.0, 9703.0], [573.0, 21203.0], [571.0, 18681.0], [569.0, 21207.0], [567.0, 21478.0], [565.0, 18414.0], [561.0, 18335.0], [607.0, 20973.0], [593.0, 10870.0], [601.0, 11611.0], [583.0, 20872.0], [581.0, 17745.0], [579.0, 18178.0], [577.0, 21426.0], [605.0, 18635.0], [603.0, 17177.0], [599.0, 18562.0], [597.0, 18169.0], [595.0, 19045.0], [591.0, 19441.0], [589.0, 17344.0], [587.0, 19710.0], [585.0, 19564.0], [637.0, 17095.0], [639.0, 17659.5], [635.0, 21962.0], [633.0, 17864.0], [631.0, 18913.0], [629.0, 18083.0], [627.0, 19037.0], [625.0, 16850.0], [623.0, 18110.0], [611.0, 20998.0], [609.0, 19312.0], [615.0, 22062.0], [613.0, 17050.0], [621.0, 20461.0], [619.0, 19393.0], [617.0, 18325.0], [669.0, 16422.0], [645.0, 11465.5], [647.0, 10452.5], [651.0, 9675.5], [649.0, 20986.0], [655.0, 19964.0], [643.0, 21058.0], [641.0, 18191.0], [653.0, 17262.0], [671.0, 19079.0], [659.0, 19446.0], [657.0, 18034.0], [667.0, 17766.0], [665.0, 16997.0], [663.0, 19035.0], [661.0, 19816.0], [701.0, 18208.0], [687.0, 12129.333333333334], [675.0, 16437.0], [673.0, 19890.0], [679.0, 21709.0], [677.0, 21193.0], [685.0, 19962.0], [683.0, 18963.0], [681.0, 20936.0], [703.0, 16351.0], [699.0, 20936.0], [697.0, 21184.0], [695.0, 20829.0], [693.0, 16060.0], [691.0, 21245.0], [689.0, 19826.0], [721.0, 18420.0], [723.0, 10449.0], [725.0, 19780.0], [727.0, 15733.0], [735.0, 20977.0], [733.0, 21150.0], [731.0, 18813.0], [729.0, 18265.0], [719.0, 20878.0], [707.0, 19130.0], [705.0, 21680.0], [711.0, 20406.0], [709.0, 20579.0], [717.0, 21242.0], [715.0, 20921.0], [713.0, 21468.0], [765.0, 19222.0], [749.0, 11676.0], [747.0, 21284.0], [745.0, 19375.0], [751.0, 10903.0], [757.0, 18004.0], [755.0, 20625.0], [753.0, 15842.0], [759.0, 19668.0], [743.0, 19882.0], [741.0, 15952.0], [739.0, 20513.0], [737.0, 19247.0], [761.0, 21321.0], [767.0, 18777.0], [763.0, 18446.0], [783.0, 15565.0], [771.0, 9638.5], [779.0, 12036.0], [777.0, 18785.0], [781.0, 18593.0], [769.0, 19708.0], [799.0, 15295.0], [785.0, 20914.0], [787.0, 20767.0], [789.0, 20656.0], [791.0, 20093.0], [797.0, 17432.0], [795.0, 15356.0], [793.0, 17367.0], [775.0, 18685.0], [773.0, 21157.0], [815.0, 16307.0], [829.0, 15304.0], [809.0, 10166.0], [811.0, 15366.0], [813.0, 15948.0], [801.0, 15846.0], [821.0, 18722.0], [819.0, 16395.0], [817.0, 20590.0], [823.0, 17388.0], [827.0, 9538.0], [831.0, 18148.0], [825.0, 19436.0], [807.0, 15270.0], [805.0, 19430.0], [803.0, 17882.0], [863.0, 14107.0], [849.0, 9162.5], [851.0, 19697.0], [853.0, 18056.0], [855.0, 17754.0], [861.0, 14074.0], [859.0, 18654.0], [839.0, 15277.0], [837.0, 16365.0], [835.0, 18421.0], [833.0, 19556.0], [847.0, 18326.0], [845.0, 17830.0], [843.0, 14980.0], [841.0, 16253.0], [865.0, 9106.5], [871.0, 11421.0], [869.0, 15999.0], [867.0, 13934.0], [889.0, 14271.0], [873.0, 18469.0], [875.0, 17937.0], [877.0, 16891.0], [879.0, 7086.0], [883.0, 9078.0], [885.0, 13781.0], [887.0, 19584.0], [891.0, 8988.5], [893.0, 8892.5], [895.0, 14114.0], [881.0, 14045.0], [899.0, 18349.0], [897.0, 10267.5], [901.0, 14947.0], [903.0, 13927.0], [921.0, 19079.0], [905.0, 9034.5], [907.0, 14724.0], [911.0, 8714.0], [909.0, 13799.0], [919.0, 10011.5], [917.0, 13718.0], [915.0, 14343.0], [913.0, 18400.0], [923.0, 9516.0], [927.0, 19200.0], [925.0, 14002.0], [943.0, 13348.0], [955.0, 13390.0], [959.0, 13316.0], [939.0, 8117.5], [937.0, 13864.0], [941.0, 14213.0], [929.0, 14620.0], [931.0, 13524.0], [933.0, 14003.0], [945.0, 14125.0], [947.0, 13777.0], [949.0, 15011.0], [951.0, 6188.0], [957.0, 13166.0], [953.0, 13765.0], [935.0, 13575.0], [975.0, 13743.0], [963.0, 8773.5], [965.0, 7143.0], [967.0, 13346.0], [969.0, 13612.0], [971.0, 13357.0], [973.0, 13860.0], [961.0, 14776.0], [991.0, 16836.0], [977.0, 14596.0], [979.0, 13941.0], [981.0, 13169.0], [983.0, 14498.0], [989.0, 13987.0], [987.0, 14034.0], [985.0, 14072.0], [993.0, 13495.0], [999.0, 8786.5], [997.0, 13273.0], [995.0, 13424.0], [1007.0, 14223.0], [1005.0, 17190.0], [1003.0, 12763.0], [1001.0, 12901.0], [1023.0, 8027.5], [1009.0, 13157.0], [1011.0, 13240.0], [1013.0, 13786.0], [1015.0, 13831.0], [1021.0, 13540.0], [1019.0, 13078.0], [1017.0, 13084.0], [1030.0, 8259.0], [1074.0, 13713.0], [1082.0, 13773.0], [1086.0, 8815.5], [1054.0, 13246.0], [1026.0, 12610.0], [1046.0, 13686.0], [1042.0, 13059.0], [1038.0, 13712.0], [1034.0, 13420.0], [1058.0, 12542.0], [1062.0, 13484.0], [1070.0, 3880.6], [1066.0, 13770.0], [1078.0, 13136.0], [1090.0, 7009.0], [1094.0, 8422.0], [1118.0, 12488.0], [1106.0, 12576.0], [1114.0, 12615.0], [1110.0, 13732.0], [1098.0, 14464.0], [1102.0, 11752.0], [1146.0, 16908.0], [1142.0, 16845.0], [1150.0, 14115.0], [1138.0, 6389.666666666666], [1122.0, 7639.5], [1126.0, 7077.333333333334], [1130.0, 13667.0], [1134.0, 6901.0], [1182.0, 6599.333333333334], [1170.0, 14645.0], [1174.0, 12153.0], [1178.0, 12296.0], [1154.0, 8203.0], [1162.0, 12868.0], [1158.0, 15621.0], [1166.0, 8374.0], [1202.0, 12621.0], [1206.0, 13557.0], [1210.0, 8234.0], [1214.0, 15276.0], [1186.0, 11318.0], [1194.0, 8676.0], [1198.0, 7586.666666666666], [1190.0, 12710.0], [1222.0, 13270.0], [1242.0, 8342.0], [1218.0, 8279.5], [1246.0, 13139.0], [1238.0, 8841.5], [1234.0, 13207.0], [1226.0, 14746.0], [1230.0, 7187.333333333334], [1250.0, 6279.5], [1254.0, 11911.5], [1258.0, 13093.0], [1278.0, 14140.0], [1274.0, 11929.0], [1270.0, 12613.0], [1262.0, 6714.8], [1266.0, 8345.5], [1286.0, 6290.8], [1294.0, 9072.0], [1306.0, 8023.0], [1310.0, 14092.0], [1282.0, 13973.0], [1298.0, 7467.0], [1302.0, 15297.0], [1290.0, 13901.0], [1334.0, 6069.2], [1338.0, 14012.0], [1342.0, 11294.0], [1314.0, 11087.0], [1330.0, 11028.0], [1322.0, 8242.0], [1318.0, 12762.0], [1326.0, 7133.0], [1346.0, 13343.0], [1366.0, 13085.0], [1362.0, 9460.0], [1350.0, 13996.0], [1374.0, 14713.0], [1354.0, 7534.0], [1358.0, 10915.0], [1394.0, 6866.25], [1398.0, 13159.0], [1402.0, 13548.0], [1406.0, 11222.0], [1378.0, 10398.5], [1390.0, 7601.666666666667], [1386.0, 10345.5], [1382.0, 12264.0], [1466.0, 11050.0], [1470.0, 11240.0], [1442.0, 11727.0], [1446.0, 10147.0], [1450.0, 10374.0], [1462.0, 10795.0], [1458.0, 10620.0], [1438.0, 12323.0], [1410.0, 13365.0], [1414.0, 10613.0], [1418.0, 12699.0], [1422.0, 10676.0], [1434.0, 13565.0], [1430.0, 12133.0], [1426.0, 12362.0], [1454.0, 12376.0], [1530.0, 9763.0], [1534.0, 11349.0], [1506.0, 10264.0], [1510.0, 10618.0], [1514.0, 11221.0], [1526.0, 9336.0], [1522.0, 10167.0], [1502.0, 12399.0], [1474.0, 10356.0], [1478.0, 10785.0], [1486.0, 10214.0], [1482.0, 11462.0], [1498.0, 11047.0], [1494.0, 10823.0], [1490.0, 13256.0], [1518.0, 11329.0], [1570.0, 8614.0], [1574.0, 7613.25], [1582.0, 12847.0], [1578.0, 8649.666666666666], [1590.0, 10180.0], [1594.0, 11199.0], [1598.0, 6571.0], [1586.0, 7474.5], [1566.0, 6971.5], [1538.0, 11159.0], [1542.0, 9167.0], [1546.0, 12661.0], [1550.0, 11714.0], [1562.0, 6640.5], [1558.0, 10430.0], [1554.0, 13162.0], [1650.0, 12255.0], [1662.0, 9252.0], [1630.0, 11125.0], [1602.0, 11124.0], [1606.0, 11934.0], [1626.0, 8767.0], [1614.0, 10491.0], [1610.0, 10637.5], [1654.0, 9464.5], [1658.0, 8715.0], [1634.0, 8149.0], [1646.0, 9182.0], [1642.0, 11162.0], [1638.0, 12223.0], [1622.0, 7479.0], [1670.0, 10824.0], [1666.0, 11068.0], [1674.0, 11970.0], [1694.0, 10194.0], [1690.0, 12270.0], [1686.0, 9134.0], [1682.0, 9543.0], [1714.0, 8090.5], [1678.0, 8861.0], [1710.0, 11112.0], [1706.0, 9987.0], [1726.0, 11803.0], [1698.0, 12174.0], [1702.0, 9503.0], [1722.0, 8346.0], [1718.0, 11696.0], [1734.0, 11485.0], [1738.0, 8747.5], [1730.0, 11071.0], [1778.0, 9322.0], [1742.0, 11888.0], [1782.0, 10271.0], [1790.0, 10764.0], [1746.0, 7678.5], [1750.0, 11606.0], [1754.0, 11506.0], [1758.0, 9240.0], [1766.0, 7877.0], [1762.0, 8927.0], [1770.0, 11630.0], [1774.0, 10596.0], [1806.0, 10973.0], [1826.0, 9236.0], [1802.0, 11305.0], [1798.0, 10164.0], [1842.0, 8947.5], [1846.0, 9401.0], [1850.0, 10885.0], [1854.0, 10850.0], [1814.0, 8489.0], [1822.0, 8864.0], [1818.0, 11053.0], [1794.0, 7908.0], [1830.0, 10916.0], [1834.0, 9529.0], [1838.0, 10777.0], [1858.0, 10399.0], [1866.0, 9705.0], [1870.0, 8609.0], [1862.0, 8768.0], [1886.0, 10489.0], [1874.0, 8813.75], [1878.0, 10362.0], [1882.0, 10526.0], [1910.0, 10306.0], [1914.0, 10175.0], [1918.0, 8988.0], [1906.0, 8863.0], [1890.0, 8435.5], [1898.0, 10440.0], [1894.0, 10101.0], [1902.0, 10196.0], [1930.0, 10052.0], [1950.0, 9784.0], [1926.0, 9114.5], [1922.0, 10117.0], [1934.0, 10691.0], [1970.0, 9608.0], [1954.0, 9730.0], [1962.0, 9731.0], [1966.0, 9647.0], [1982.0, 9552.0], [1978.0, 10303.0], [1974.0, 9650.0], [1938.0, 7920.0], [1942.0, 9936.0], [1946.0, 9914.0], [1990.0, 8809.0], [1986.0, 9524.0], [1994.0, 10395.0], [1998.0, 8718.0], [2002.0, 9406.0], [2006.0, 8638.0], [2010.0, 8581.0], [2014.0, 8563.0], [2018.0, 7988.5], [2042.0, 9134.0], [2046.0, 9267.0], [2034.0, 8350.0], [2038.0, 7974.571428571428], [2022.0, 8488.0], [2026.0, 8493.5], [2030.0, 7886.5], [2060.0, 8023.0], [2052.0, 9074.0], [2108.0, 8732.0], [2100.0, 9157.0], [2092.0, 8985.0], [2084.0, 7507.333333333333], [2068.0, 7946.0], [2076.0, 8223.0], [2148.0, 8130.0], [2156.0, 8530.0], [2164.0, 8015.5], [2116.0, 8358.0], [2172.0, 8346.0], [2124.0, 7641.0], [2132.0, 8087.0], [2140.0, 7804.0], [2180.0, 8971.0], [2188.0, 8526.0], [2196.0, 8311.0], [2204.0, 7661.5], [2212.0, 7817.0], [2061.0, 7992.0], [2077.0, 8074.0], [2109.0, 7580.0], [2101.0, 7912.0], [2093.0, 8346.0], [2085.0, 9182.5], [2053.0, 8909.0], [2069.0, 8758.0], [2117.0, 8269.0], [2173.0, 8268.0], [2165.0, 8632.0], [2157.0, 7894.571428571429], [2149.0, 7467.5], [2125.0, 7447.0], [2133.0, 8334.0], [2141.0, 8175.0], [2181.0, 8366.0], [2197.0, 7770.75], [2189.0, 8497.0], [2205.0, 8146.666666666667], [2213.0, 8005.0], [1027.0, 8841.0], [1035.0, 13006.0], [1031.0, 13157.0], [1039.0, 16088.0], [1055.0, 12540.0], [1051.0, 15608.0], [1043.0, 8911.0], [1047.0, 12884.0], [1075.0, 12545.0], [1079.0, 13419.0], [1087.0, 12756.0], [1083.0, 12843.0], [1063.0, 14094.0], [1059.0, 12720.0], [1067.0, 17281.0], [1071.0, 15489.5], [1099.0, 12859.0], [1103.0, 8788.5], [1119.0, 7103.666666666666], [1115.0, 8735.0], [1107.0, 11953.0], [1111.0, 13853.0], [1095.0, 5040.571428571428], [1091.0, 17404.0], [1139.0, 3548.0], [1143.0, 7131.333333333334], [1151.0, 8091.0], [1147.0, 13848.0], [1123.0, 8869.0], [1135.0, 7091.0], [1131.0, 8102.0], [1127.0, 12541.0], [1163.0, 8305.0], [1155.0, 13287.0], [1183.0, 12440.0], [1179.0, 10419.0], [1175.0, 12889.0], [1171.0, 6581.0], [1211.0, 8801.5], [1215.0, 11743.0], [1187.0, 6454.0], [1191.0, 7503.333333333334], [1195.0, 13499.0], [1199.0, 15251.0], [1207.0, 15720.0], [1203.0, 11512.0], [1167.0, 13095.0], [1219.0, 8341.0], [1231.0, 5762.0], [1243.0, 7145.0], [1247.0, 13226.0], [1239.0, 9628.5], [1235.0, 8373.0], [1223.0, 12469.0], [1227.0, 16419.0], [1255.0, 9951.0], [1251.0, 14730.0], [1263.0, 7394.333333333334], [1259.0, 11369.0], [1275.0, 13439.0], [1279.0, 15592.0], [1267.0, 7100.0], [1291.0, 12824.0], [1287.0, 7436.25], [1283.0, 15364.0], [1311.0, 9636.5], [1303.0, 9026.0], [1307.0, 15643.0], [1295.0, 8977.0], [1331.0, 14220.0], [1343.0, 7719.333333333334], [1315.0, 14581.0], [1339.0, 14234.0], [1335.0, 14505.0], [1319.0, 8120.0], [1323.0, 12818.0], [1327.0, 7693.0], [1299.0, 11055.0], [1347.0, 12848.0], [1355.0, 8088.666666666666], [1375.0, 6130.333333333333], [1371.0, 13701.5], [1367.0, 8172.5], [1363.0, 9396.0], [1351.0, 10860.0], [1359.0, 7028.0], [1395.0, 8396.5], [1399.0, 12219.0], [1403.0, 12497.0], [1407.0, 11845.0], [1383.0, 7805.333333333334], [1379.0, 11774.0], [1387.0, 6879.0], [1391.0, 12329.0], [1467.0, 10616.0], [1471.0, 10674.0], [1443.0, 10218.0], [1451.0, 12722.0], [1463.0, 12875.0], [1459.0, 10223.0], [1439.0, 12719.0], [1411.0, 12906.0], [1415.0, 12363.0], [1419.0, 12255.0], [1423.0, 10571.0], [1435.0, 10191.0], [1431.0, 11540.0], [1427.0, 13816.0], [1455.0, 13466.0], [1531.0, 10729.0], [1535.0, 10191.0], [1507.0, 12782.0], [1511.0, 11584.0], [1515.0, 10381.0], [1527.0, 9430.0], [1523.0, 10860.0], [1503.0, 9967.0], [1475.0, 12713.0], [1479.0, 12906.0], [1483.0, 13496.0], [1487.0, 10165.0], [1499.0, 11051.0], [1495.0, 11559.0], [1491.0, 11228.0], [1519.0, 12161.0], [1571.0, 8020.5], [1579.0, 7041.0], [1583.0, 10801.0], [1575.0, 7434.0], [1599.0, 9876.333333333334], [1595.0, 8412.0], [1591.0, 12353.0], [1587.0, 7146.0], [1567.0, 6029.5], [1539.0, 9467.0], [1543.0, 11332.0], [1547.0, 12684.0], [1551.0, 9371.0], [1563.0, 6732.75], [1559.0, 10105.0], [1555.0, 13290.0], [1651.0, 11882.0], [1615.0, 7989.5], [1631.0, 8866.5], [1611.0, 6572.0], [1607.0, 10931.0], [1603.0, 10899.0], [1655.0, 8495.0], [1659.0, 6531.5], [1635.0, 7979.0], [1647.0, 10813.0], [1643.0, 9707.0], [1639.0, 9564.0], [1663.0, 11539.0], [1619.0, 10663.0], [1623.0, 7706.0], [1627.0, 11999.0], [1671.0, 8581.5], [1679.0, 11251.0], [1719.0, 8729.0], [1667.0, 12156.0], [1675.0, 12204.0], [1715.0, 9384.0], [1683.0, 8602.0], [1687.0, 9067.5], [1691.0, 10901.0], [1695.0, 9509.0], [1703.0, 10903.0], [1707.0, 11958.0], [1711.0, 8528.0], [1727.0, 10287.0], [1723.0, 11761.0], [1759.0, 9569.5], [1779.0, 11611.0], [1783.0, 7852.0], [1791.0, 9407.0], [1787.0, 10928.5], [1747.0, 11097.0], [1751.0, 11428.0], [1755.0, 7965.0], [1743.0, 8519.0], [1739.0, 8213.0], [1735.0, 11330.0], [1731.0, 11611.0], [1763.0, 9275.0], [1767.0, 11479.0], [1771.0, 9641.0], [1775.0, 11381.0], [1803.0, 9936.0], [1851.0, 8071.0], [1795.0, 9285.0], [1799.0, 9532.0], [1807.0, 11043.0], [1843.0, 10923.0], [1847.0, 10501.0], [1855.0, 8271.333333333334], [1811.0, 9827.666666666666], [1815.0, 11117.0], [1823.0, 10630.0], [1827.0, 8171.0], [1831.0, 8410.5], [1835.0, 8785.5], [1839.0, 10947.0], [1859.0, 10541.0], [1863.0, 10715.0], [1887.0, 10486.0], [1875.0, 10580.0], [1879.0, 10530.0], [1883.0, 7941.0], [1867.0, 8641.5], [1871.0, 9189.5], [1911.0, 10246.0], [1915.0, 9978.0], [1919.0, 10154.0], [1907.0, 8321.666666666666], [1891.0, 10451.0], [1899.0, 10398.0], [1895.0, 10443.0], [1903.0, 10336.0], [1935.0, 9941.0], [1971.0, 8403.5], [1951.0, 9829.0], [1923.0, 10098.0], [1927.0, 9944.0], [1931.0, 10044.0], [1955.0, 8476.5], [1959.0, 9693.0], [1963.0, 10654.0], [1967.0, 9673.0], [1983.0, 9001.0], [1979.0, 7758.5], [1975.0, 9602.0], [1939.0, 9879.0], [1943.0, 8485.0], [1947.0, 8371.5], [1991.0, 10090.0], [1995.0, 7943.666666666667], [1987.0, 9545.0], [1999.0, 8680.0], [2003.0, 9643.0], [2007.0, 8599.0], [2011.0, 8539.0], [2015.0, 9308.0], [2019.0, 9160.0], [2043.0, 7634.5], [2047.0, 9051.0], [2039.0, 7811.0], [2035.0, 7688.5], [2023.0, 8517.5], [2027.0, 9157.0], [2031.0, 8287.0], [2062.0, 8008.0], [2054.0, 9743.0], [2110.0, 8611.0], [2102.0, 8505.0], [2094.0, 8722.0], [2086.0, 8611.0], [2070.0, 7500.5], [2078.0, 7857.0], [2150.0, 7554.5], [2158.0, 7590.333333333334], [2166.0, 8021.0], [2174.0, 8108.0], [2118.0, 8138.0], [2126.0, 8340.0], [2134.0, 7463.5], [2142.0, 8360.0], [2190.0, 8383.5], [2182.0, 7393.0], [2198.0, 8819.0], [2206.0, 7875.0], [2214.0, 6876.0], [2063.0, 7965.0], [2111.0, 8402.0], [2103.0, 8645.0], [2095.0, 8734.0], [2087.0, 8855.0], [2055.0, 7880.5], [2071.0, 7798.333333333333], [2119.0, 8592.0], [2175.0, 9208.0], [2167.0, 8050.0], [2159.0, 8494.5], [2151.0, 8170.0], [2079.0, 7878.0], [2127.0, 8537.0], [2135.0, 9120.0], [2143.0, 8995.0], [2191.0, 7826.0], [2215.0, 6895.0], [2183.0, 7724.0], [2199.0, 7930.5], [2207.0, 8739.0], [1.0, 20921.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[1193.6066666666686, 12596.505666666666]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 2215.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 9267.916666666666, "minX": 1.54961874E12, "maxY": 10699.2, "series": [{"data": [[1.54961874E12, 10699.2], [1.5496188E12, 10348.933333333332]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54961874E12, 9582.083333333334], [1.5496188E12, 9267.916666666666]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496188E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 7534.419672131138, "minX": 1.54961874E12, "maxY": 17830.187796610167, "series": [{"data": [[1.54961874E12, 7534.419672131138], [1.5496188E12, 17830.187796610167]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496188E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 7534.41114754099, "minX": 1.54961874E12, "maxY": 17830.183728813554, "series": [{"data": [[1.54961874E12, 7534.41114754099], [1.5496188E12, 17830.183728813554]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496188E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 70.75186440677956, "minX": 1.54961874E12, "maxY": 97.60655737704931, "series": [{"data": [[1.54961874E12, 97.60655737704931], [1.5496188E12, 70.75186440677956]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496188E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 710.0, "minX": 1.54961874E12, "maxY": 26329.0, "series": [{"data": [[1.54961874E12, 13496.0], [1.5496188E12, 26329.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54961874E12, 710.0], [1.5496188E12, 10024.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54961874E12, 11057.800000000001], [1.5496188E12, 21902.8]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54961874E12, 12777.84], [1.5496188E12, 25432.759999999995]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54961874E12, 11611.0], [1.5496188E12, 23535.249999999993]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496188E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 7862.0, "minX": 24.0, "maxY": 18196.0, "series": [{"data": [[24.0, 18196.0], [25.0, 7862.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 25.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 7862.0, "minX": 24.0, "maxY": 18196.0, "series": [{"data": [[24.0, 18196.0], [25.0, 7862.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 25.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 50.0, "minX": 1.54961874E12, "maxY": 50.0, "series": [{"data": [[1.54961874E12, 50.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961874E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 24.583333333333332, "minX": 1.54961874E12, "maxY": 25.416666666666668, "series": [{"data": [[1.54961874E12, 25.416666666666668], [1.5496188E12, 24.583333333333332]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496188E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 24.583333333333332, "minX": 1.54961874E12, "maxY": 25.416666666666668, "series": [{"data": [[1.54961874E12, 25.416666666666668], [1.5496188E12, 24.583333333333332]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496188E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
