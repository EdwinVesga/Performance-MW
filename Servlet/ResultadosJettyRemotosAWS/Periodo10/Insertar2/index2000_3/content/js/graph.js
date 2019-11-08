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
        data: {"result": {"minY": 355.0, "minX": 0.0, "maxY": 14448.0, "series": [{"data": [[0.0, 355.0], [0.1, 368.0], [0.2, 379.0], [0.3, 402.0], [0.4, 403.0], [0.5, 411.0], [0.6, 418.0], [0.7, 428.0], [0.8, 464.0], [0.9, 479.0], [1.0, 505.0], [1.1, 512.0], [1.2, 536.0], [1.3, 544.0], [1.4, 553.0], [1.5, 562.0], [1.6, 580.0], [1.7, 601.0], [1.8, 618.0], [1.9, 629.0], [2.0, 639.0], [2.1, 655.0], [2.2, 675.0], [2.3, 677.0], [2.4, 694.0], [2.5, 712.0], [2.6, 756.0], [2.7, 768.0], [2.8, 809.0], [2.9, 825.0], [3.0, 849.0], [3.1, 868.0], [3.2, 879.0], [3.3, 996.0], [3.4, 1298.0], [3.5, 1414.0], [3.6, 1507.0], [3.7, 1517.0], [3.8, 1532.0], [3.9, 1589.0], [4.0, 1659.0], [4.1, 1665.0], [4.2, 1681.0], [4.3, 1688.0], [4.4, 1732.0], [4.5, 1762.0], [4.6, 1816.0], [4.7, 1887.0], [4.8, 1966.0], [4.9, 1990.0], [5.0, 2055.0], [5.1, 2100.0], [5.2, 2129.0], [5.3, 2139.0], [5.4, 2155.0], [5.5, 2226.0], [5.6, 2270.0], [5.7, 2383.0], [5.8, 2412.0], [5.9, 2457.0], [6.0, 2502.0], [6.1, 2536.0], [6.2, 2572.0], [6.3, 2582.0], [6.4, 2598.0], [6.5, 2615.0], [6.6, 2652.0], [6.7, 2695.0], [6.8, 2716.0], [6.9, 2738.0], [7.0, 2741.0], [7.1, 2768.0], [7.2, 2792.0], [7.3, 2845.0], [7.4, 2880.0], [7.5, 2929.0], [7.6, 2959.0], [7.7, 2981.0], [7.8, 2998.0], [7.9, 3014.0], [8.0, 3028.0], [8.1, 3037.0], [8.2, 3072.0], [8.3, 3092.0], [8.4, 3120.0], [8.5, 3125.0], [8.6, 3146.0], [8.7, 3165.0], [8.8, 3184.0], [8.9, 3196.0], [9.0, 3207.0], [9.1, 3229.0], [9.2, 3249.0], [9.3, 3261.0], [9.4, 3274.0], [9.5, 3293.0], [9.6, 3308.0], [9.7, 3312.0], [9.8, 3315.0], [9.9, 3321.0], [10.0, 3322.0], [10.1, 3333.0], [10.2, 3344.0], [10.3, 3349.0], [10.4, 3358.0], [10.5, 3386.0], [10.6, 3391.0], [10.7, 3412.0], [10.8, 3438.0], [10.9, 3455.0], [11.0, 3481.0], [11.1, 3500.0], [11.2, 3505.0], [11.3, 3545.0], [11.4, 3559.0], [11.5, 3563.0], [11.6, 3573.0], [11.7, 3583.0], [11.8, 3593.0], [11.9, 3598.0], [12.0, 3602.0], [12.1, 3604.0], [12.2, 3610.0], [12.3, 3616.0], [12.4, 3621.0], [12.5, 3632.0], [12.6, 3665.0], [12.7, 3674.0], [12.8, 3694.0], [12.9, 3706.0], [13.0, 3711.0], [13.1, 3718.0], [13.2, 3727.0], [13.3, 3732.0], [13.4, 3740.0], [13.5, 3743.0], [13.6, 3745.0], [13.7, 3772.0], [13.8, 3791.0], [13.9, 3796.0], [14.0, 3805.0], [14.1, 3810.0], [14.2, 3824.0], [14.3, 3828.0], [14.4, 3830.0], [14.5, 3843.0], [14.6, 3850.0], [14.7, 3856.0], [14.8, 3864.0], [14.9, 3880.0], [15.0, 3892.0], [15.1, 3893.0], [15.2, 3919.0], [15.3, 3937.0], [15.4, 3942.0], [15.5, 3962.0], [15.6, 3987.0], [15.7, 3991.0], [15.8, 4006.0], [15.9, 4007.0], [16.0, 4009.0], [16.1, 4016.0], [16.2, 4035.0], [16.3, 4047.0], [16.4, 4059.0], [16.5, 4064.0], [16.6, 4069.0], [16.7, 4077.0], [16.8, 4092.0], [16.9, 4100.0], [17.0, 4106.0], [17.1, 4120.0], [17.2, 4123.0], [17.3, 4125.0], [17.4, 4141.0], [17.5, 4148.0], [17.6, 4160.0], [17.7, 4178.0], [17.8, 4182.0], [17.9, 4193.0], [18.0, 4200.0], [18.1, 4205.0], [18.2, 4207.0], [18.3, 4220.0], [18.4, 4229.0], [18.5, 4239.0], [18.6, 4243.0], [18.7, 4278.0], [18.8, 4282.0], [18.9, 4292.0], [19.0, 4303.0], [19.1, 4322.0], [19.2, 4333.0], [19.3, 4350.0], [19.4, 4360.0], [19.5, 4377.0], [19.6, 4378.0], [19.7, 4402.0], [19.8, 4414.0], [19.9, 4425.0], [20.0, 4441.0], [20.1, 4451.0], [20.2, 4483.0], [20.3, 4510.0], [20.4, 4520.0], [20.5, 4521.0], [20.6, 4538.0], [20.7, 4563.0], [20.8, 4573.0], [20.9, 4595.0], [21.0, 4607.0], [21.1, 4616.0], [21.2, 4623.0], [21.3, 4632.0], [21.4, 4653.0], [21.5, 4680.0], [21.6, 4697.0], [21.7, 4729.0], [21.8, 4732.0], [21.9, 4744.0], [22.0, 4772.0], [22.1, 4778.0], [22.2, 4779.0], [22.3, 4791.0], [22.4, 4795.0], [22.5, 4802.0], [22.6, 4807.0], [22.7, 4821.0], [22.8, 4835.0], [22.9, 4843.0], [23.0, 4852.0], [23.1, 4869.0], [23.2, 4871.0], [23.3, 4873.0], [23.4, 4887.0], [23.5, 4890.0], [23.6, 4894.0], [23.7, 4914.0], [23.8, 4917.0], [23.9, 4919.0], [24.0, 4934.0], [24.1, 4957.0], [24.2, 4969.0], [24.3, 4976.0], [24.4, 4979.0], [24.5, 4982.0], [24.6, 4997.0], [24.7, 5014.0], [24.8, 5023.0], [24.9, 5025.0], [25.0, 5029.0], [25.1, 5041.0], [25.2, 5041.0], [25.3, 5053.0], [25.4, 5062.0], [25.5, 5076.0], [25.6, 5089.0], [25.7, 5104.0], [25.8, 5106.0], [25.9, 5118.0], [26.0, 5126.0], [26.1, 5154.0], [26.2, 5160.0], [26.3, 5178.0], [26.4, 5188.0], [26.5, 5204.0], [26.6, 5211.0], [26.7, 5223.0], [26.8, 5231.0], [26.9, 5239.0], [27.0, 5245.0], [27.1, 5257.0], [27.2, 5276.0], [27.3, 5289.0], [27.4, 5297.0], [27.5, 5312.0], [27.6, 5332.0], [27.7, 5340.0], [27.8, 5361.0], [27.9, 5378.0], [28.0, 5392.0], [28.1, 5411.0], [28.2, 5415.0], [28.3, 5429.0], [28.4, 5440.0], [28.5, 5451.0], [28.6, 5459.0], [28.7, 5484.0], [28.8, 5486.0], [28.9, 5492.0], [29.0, 5498.0], [29.1, 5509.0], [29.2, 5514.0], [29.3, 5515.0], [29.4, 5525.0], [29.5, 5527.0], [29.6, 5530.0], [29.7, 5542.0], [29.8, 5553.0], [29.9, 5557.0], [30.0, 5566.0], [30.1, 5575.0], [30.2, 5593.0], [30.3, 5621.0], [30.4, 5637.0], [30.5, 5650.0], [30.6, 5663.0], [30.7, 5678.0], [30.8, 5686.0], [30.9, 5699.0], [31.0, 5712.0], [31.1, 5722.0], [31.2, 5724.0], [31.3, 5730.0], [31.4, 5755.0], [31.5, 5774.0], [31.6, 5782.0], [31.7, 5798.0], [31.8, 5814.0], [31.9, 5820.0], [32.0, 5828.0], [32.1, 5841.0], [32.2, 5846.0], [32.3, 5860.0], [32.4, 5866.0], [32.5, 5879.0], [32.6, 5887.0], [32.7, 5897.0], [32.8, 5912.0], [32.9, 5917.0], [33.0, 5924.0], [33.1, 5930.0], [33.2, 5936.0], [33.3, 5955.0], [33.4, 5973.0], [33.5, 5981.0], [33.6, 5998.0], [33.7, 6003.0], [33.8, 6010.0], [33.9, 6015.0], [34.0, 6027.0], [34.1, 6029.0], [34.2, 6033.0], [34.3, 6044.0], [34.4, 6051.0], [34.5, 6059.0], [34.6, 6064.0], [34.7, 6069.0], [34.8, 6076.0], [34.9, 6082.0], [35.0, 6093.0], [35.1, 6108.0], [35.2, 6111.0], [35.3, 6112.0], [35.4, 6125.0], [35.5, 6132.0], [35.6, 6151.0], [35.7, 6155.0], [35.8, 6160.0], [35.9, 6166.0], [36.0, 6172.0], [36.1, 6178.0], [36.2, 6182.0], [36.3, 6187.0], [36.4, 6197.0], [36.5, 6198.0], [36.6, 6207.0], [36.7, 6226.0], [36.8, 6233.0], [36.9, 6243.0], [37.0, 6269.0], [37.1, 6285.0], [37.2, 6288.0], [37.3, 6295.0], [37.4, 6314.0], [37.5, 6324.0], [37.6, 6331.0], [37.7, 6347.0], [37.8, 6356.0], [37.9, 6360.0], [38.0, 6366.0], [38.1, 6387.0], [38.2, 6388.0], [38.3, 6391.0], [38.4, 6414.0], [38.5, 6416.0], [38.6, 6445.0], [38.7, 6449.0], [38.8, 6454.0], [38.9, 6460.0], [39.0, 6464.0], [39.1, 6474.0], [39.2, 6481.0], [39.3, 6482.0], [39.4, 6489.0], [39.5, 6491.0], [39.6, 6496.0], [39.7, 6497.0], [39.8, 6500.0], [39.9, 6509.0], [40.0, 6517.0], [40.1, 6519.0], [40.2, 6520.0], [40.3, 6536.0], [40.4, 6537.0], [40.5, 6549.0], [40.6, 6553.0], [40.7, 6557.0], [40.8, 6569.0], [40.9, 6571.0], [41.0, 6576.0], [41.1, 6578.0], [41.2, 6583.0], [41.3, 6586.0], [41.4, 6595.0], [41.5, 6598.0], [41.6, 6612.0], [41.7, 6626.0], [41.8, 6636.0], [41.9, 6655.0], [42.0, 6661.0], [42.1, 6663.0], [42.2, 6667.0], [42.3, 6675.0], [42.4, 6689.0], [42.5, 6700.0], [42.6, 6711.0], [42.7, 6721.0], [42.8, 6723.0], [42.9, 6728.0], [43.0, 6732.0], [43.1, 6736.0], [43.2, 6739.0], [43.3, 6781.0], [43.4, 6791.0], [43.5, 6794.0], [43.6, 6809.0], [43.7, 6812.0], [43.8, 6841.0], [43.9, 6851.0], [44.0, 6855.0], [44.1, 6862.0], [44.2, 6869.0], [44.3, 6877.0], [44.4, 6895.0], [44.5, 6911.0], [44.6, 6921.0], [44.7, 6945.0], [44.8, 6948.0], [44.9, 6968.0], [45.0, 6980.0], [45.1, 6983.0], [45.2, 6984.0], [45.3, 6988.0], [45.4, 6991.0], [45.5, 7000.0], [45.6, 7007.0], [45.7, 7012.0], [45.8, 7027.0], [45.9, 7037.0], [46.0, 7044.0], [46.1, 7060.0], [46.2, 7063.0], [46.3, 7068.0], [46.4, 7072.0], [46.5, 7080.0], [46.6, 7081.0], [46.7, 7103.0], [46.8, 7106.0], [46.9, 7113.0], [47.0, 7119.0], [47.1, 7124.0], [47.2, 7126.0], [47.3, 7130.0], [47.4, 7132.0], [47.5, 7136.0], [47.6, 7148.0], [47.7, 7172.0], [47.8, 7191.0], [47.9, 7201.0], [48.0, 7207.0], [48.1, 7219.0], [48.2, 7230.0], [48.3, 7243.0], [48.4, 7249.0], [48.5, 7255.0], [48.6, 7256.0], [48.7, 7265.0], [48.8, 7283.0], [48.9, 7302.0], [49.0, 7305.0], [49.1, 7321.0], [49.2, 7323.0], [49.3, 7330.0], [49.4, 7337.0], [49.5, 7342.0], [49.6, 7349.0], [49.7, 7356.0], [49.8, 7359.0], [49.9, 7361.0], [50.0, 7370.0], [50.1, 7372.0], [50.2, 7377.0], [50.3, 7381.0], [50.4, 7384.0], [50.5, 7397.0], [50.6, 7404.0], [50.7, 7418.0], [50.8, 7433.0], [50.9, 7434.0], [51.0, 7440.0], [51.1, 7451.0], [51.2, 7472.0], [51.3, 7478.0], [51.4, 7481.0], [51.5, 7484.0], [51.6, 7493.0], [51.7, 7497.0], [51.8, 7550.0], [51.9, 7555.0], [52.0, 7575.0], [52.1, 7590.0], [52.2, 7596.0], [52.3, 7609.0], [52.4, 7625.0], [52.5, 7686.0], [52.6, 7723.0], [52.7, 7726.0], [52.8, 7731.0], [52.9, 7739.0], [53.0, 7741.0], [53.1, 7745.0], [53.2, 7759.0], [53.3, 7767.0], [53.4, 7775.0], [53.5, 7786.0], [53.6, 7796.0], [53.7, 7810.0], [53.8, 7828.0], [53.9, 7837.0], [54.0, 7848.0], [54.1, 7886.0], [54.2, 7908.0], [54.3, 7919.0], [54.4, 7935.0], [54.5, 7942.0], [54.6, 7948.0], [54.7, 7952.0], [54.8, 7955.0], [54.9, 7972.0], [55.0, 7998.0], [55.1, 8008.0], [55.2, 8015.0], [55.3, 8022.0], [55.4, 8026.0], [55.5, 8036.0], [55.6, 8041.0], [55.7, 8061.0], [55.8, 8064.0], [55.9, 8066.0], [56.0, 8075.0], [56.1, 8079.0], [56.2, 8084.0], [56.3, 8087.0], [56.4, 8114.0], [56.5, 8131.0], [56.6, 8147.0], [56.7, 8150.0], [56.8, 8152.0], [56.9, 8179.0], [57.0, 8187.0], [57.1, 8194.0], [57.2, 8201.0], [57.3, 8218.0], [57.4, 8227.0], [57.5, 8241.0], [57.6, 8251.0], [57.7, 8258.0], [57.8, 8267.0], [57.9, 8274.0], [58.0, 8277.0], [58.1, 8281.0], [58.2, 8285.0], [58.3, 8297.0], [58.4, 8299.0], [58.5, 8303.0], [58.6, 8308.0], [58.7, 8318.0], [58.8, 8322.0], [58.9, 8326.0], [59.0, 8327.0], [59.1, 8344.0], [59.2, 8355.0], [59.3, 8366.0], [59.4, 8391.0], [59.5, 8403.0], [59.6, 8406.0], [59.7, 8415.0], [59.8, 8425.0], [59.9, 8443.0], [60.0, 8448.0], [60.1, 8453.0], [60.2, 8461.0], [60.3, 8480.0], [60.4, 8489.0], [60.5, 8491.0], [60.6, 8504.0], [60.7, 8509.0], [60.8, 8514.0], [60.9, 8530.0], [61.0, 8549.0], [61.1, 8549.0], [61.2, 8563.0], [61.3, 8572.0], [61.4, 8576.0], [61.5, 8587.0], [61.6, 8592.0], [61.7, 8596.0], [61.8, 8600.0], [61.9, 8612.0], [62.0, 8623.0], [62.1, 8626.0], [62.2, 8627.0], [62.3, 8629.0], [62.4, 8640.0], [62.5, 8646.0], [62.6, 8656.0], [62.7, 8668.0], [62.8, 8687.0], [62.9, 8689.0], [63.0, 8695.0], [63.1, 8697.0], [63.2, 8713.0], [63.3, 8718.0], [63.4, 8736.0], [63.5, 8741.0], [63.6, 8752.0], [63.7, 8768.0], [63.8, 8773.0], [63.9, 8774.0], [64.0, 8793.0], [64.1, 8812.0], [64.2, 8820.0], [64.3, 8829.0], [64.4, 8836.0], [64.5, 8842.0], [64.6, 8853.0], [64.7, 8857.0], [64.8, 8869.0], [64.9, 8878.0], [65.0, 8904.0], [65.1, 8913.0], [65.2, 8942.0], [65.3, 8951.0], [65.4, 8956.0], [65.5, 8957.0], [65.6, 8958.0], [65.7, 8965.0], [65.8, 8969.0], [65.9, 8972.0], [66.0, 8993.0], [66.1, 9007.0], [66.2, 9014.0], [66.3, 9017.0], [66.4, 9024.0], [66.5, 9026.0], [66.6, 9033.0], [66.7, 9044.0], [66.8, 9047.0], [66.9, 9049.0], [67.0, 9052.0], [67.1, 9063.0], [67.2, 9073.0], [67.3, 9083.0], [67.4, 9086.0], [67.5, 9105.0], [67.6, 9118.0], [67.7, 9125.0], [67.8, 9138.0], [67.9, 9144.0], [68.0, 9164.0], [68.1, 9165.0], [68.2, 9176.0], [68.3, 9178.0], [68.4, 9182.0], [68.5, 9189.0], [68.6, 9192.0], [68.7, 9205.0], [68.8, 9211.0], [68.9, 9223.0], [69.0, 9243.0], [69.1, 9258.0], [69.2, 9262.0], [69.3, 9263.0], [69.4, 9265.0], [69.5, 9275.0], [69.6, 9278.0], [69.7, 9299.0], [69.8, 9308.0], [69.9, 9315.0], [70.0, 9328.0], [70.1, 9337.0], [70.2, 9364.0], [70.3, 9369.0], [70.4, 9382.0], [70.5, 9392.0], [70.6, 9398.0], [70.7, 9412.0], [70.8, 9429.0], [70.9, 9436.0], [71.0, 9444.0], [71.1, 9460.0], [71.2, 9466.0], [71.3, 9472.0], [71.4, 9479.0], [71.5, 9486.0], [71.6, 9498.0], [71.7, 9519.0], [71.8, 9521.0], [71.9, 9526.0], [72.0, 9532.0], [72.1, 9542.0], [72.2, 9557.0], [72.3, 9558.0], [72.4, 9578.0], [72.5, 9582.0], [72.6, 9588.0], [72.7, 9597.0], [72.8, 9601.0], [72.9, 9628.0], [73.0, 9631.0], [73.1, 9655.0], [73.2, 9662.0], [73.3, 9676.0], [73.4, 9680.0], [73.5, 9686.0], [73.6, 9694.0], [73.7, 9704.0], [73.8, 9743.0], [73.9, 9745.0], [74.0, 9758.0], [74.1, 9780.0], [74.2, 9784.0], [74.3, 9796.0], [74.4, 9813.0], [74.5, 9818.0], [74.6, 9822.0], [74.7, 9839.0], [74.8, 9860.0], [74.9, 9866.0], [75.0, 9889.0], [75.1, 9907.0], [75.2, 9950.0], [75.3, 9968.0], [75.4, 9973.0], [75.5, 9980.0], [75.6, 9989.0], [75.7, 10004.0], [75.8, 10005.0], [75.9, 10026.0], [76.0, 10043.0], [76.1, 10063.0], [76.2, 10065.0], [76.3, 10085.0], [76.4, 10096.0], [76.5, 10124.0], [76.6, 10131.0], [76.7, 10144.0], [76.8, 10147.0], [76.9, 10164.0], [77.0, 10169.0], [77.1, 10184.0], [77.2, 10188.0], [77.3, 10217.0], [77.4, 10230.0], [77.5, 10234.0], [77.6, 10242.0], [77.7, 10246.0], [77.8, 10257.0], [77.9, 10272.0], [78.0, 10278.0], [78.1, 10291.0], [78.2, 10296.0], [78.3, 10310.0], [78.4, 10314.0], [78.5, 10316.0], [78.6, 10319.0], [78.7, 10322.0], [78.8, 10328.0], [78.9, 10333.0], [79.0, 10338.0], [79.1, 10340.0], [79.2, 10350.0], [79.3, 10361.0], [79.4, 10363.0], [79.5, 10376.0], [79.6, 10389.0], [79.7, 10402.0], [79.8, 10416.0], [79.9, 10424.0], [80.0, 10427.0], [80.1, 10430.0], [80.2, 10432.0], [80.3, 10433.0], [80.4, 10437.0], [80.5, 10448.0], [80.6, 10458.0], [80.7, 10462.0], [80.8, 10469.0], [80.9, 10471.0], [81.0, 10474.0], [81.1, 10476.0], [81.2, 10479.0], [81.3, 10483.0], [81.4, 10485.0], [81.5, 10489.0], [81.6, 10495.0], [81.7, 10504.0], [81.8, 10511.0], [81.9, 10516.0], [82.0, 10528.0], [82.1, 10535.0], [82.2, 10542.0], [82.3, 10548.0], [82.4, 10549.0], [82.5, 10550.0], [82.6, 10553.0], [82.7, 10560.0], [82.8, 10561.0], [82.9, 10569.0], [83.0, 10576.0], [83.1, 10578.0], [83.2, 10582.0], [83.3, 10584.0], [83.4, 10585.0], [83.5, 10586.0], [83.6, 10600.0], [83.7, 10607.0], [83.8, 10619.0], [83.9, 10622.0], [84.0, 10628.0], [84.1, 10635.0], [84.2, 10645.0], [84.3, 10658.0], [84.4, 10672.0], [84.5, 10673.0], [84.6, 10678.0], [84.7, 10678.0], [84.8, 10701.0], [84.9, 10717.0], [85.0, 10724.0], [85.1, 10727.0], [85.2, 10736.0], [85.3, 10743.0], [85.4, 10747.0], [85.5, 10748.0], [85.6, 10757.0], [85.7, 10780.0], [85.8, 10793.0], [85.9, 10801.0], [86.0, 10805.0], [86.1, 10806.0], [86.2, 10812.0], [86.3, 10813.0], [86.4, 10817.0], [86.5, 10826.0], [86.6, 10833.0], [86.7, 10838.0], [86.8, 10838.0], [86.9, 10841.0], [87.0, 10846.0], [87.1, 10848.0], [87.2, 10854.0], [87.3, 10856.0], [87.4, 10871.0], [87.5, 10879.0], [87.6, 10894.0], [87.7, 10904.0], [87.8, 10916.0], [87.9, 10934.0], [88.0, 10941.0], [88.1, 10963.0], [88.2, 10966.0], [88.3, 10970.0], [88.4, 10974.0], [88.5, 10980.0], [88.6, 10990.0], [88.7, 11008.0], [88.8, 11013.0], [88.9, 11024.0], [89.0, 11027.0], [89.1, 11030.0], [89.2, 11040.0], [89.3, 11048.0], [89.4, 11065.0], [89.5, 11069.0], [89.6, 11079.0], [89.7, 11094.0], [89.8, 11099.0], [89.9, 11101.0], [90.0, 11109.0], [90.1, 11133.0], [90.2, 11136.0], [90.3, 11150.0], [90.4, 11157.0], [90.5, 11163.0], [90.6, 11168.0], [90.7, 11181.0], [90.8, 11185.0], [90.9, 11193.0], [91.0, 11195.0], [91.1, 11198.0], [91.2, 11210.0], [91.3, 11230.0], [91.4, 11237.0], [91.5, 11266.0], [91.6, 11279.0], [91.7, 11288.0], [91.8, 11293.0], [91.9, 11296.0], [92.0, 11316.0], [92.1, 11319.0], [92.2, 11322.0], [92.3, 11324.0], [92.4, 11335.0], [92.5, 11338.0], [92.6, 11355.0], [92.7, 11370.0], [92.8, 11380.0], [92.9, 11394.0], [93.0, 11403.0], [93.1, 11406.0], [93.2, 11420.0], [93.3, 11432.0], [93.4, 11440.0], [93.5, 11441.0], [93.6, 11453.0], [93.7, 11463.0], [93.8, 11469.0], [93.9, 11472.0], [94.0, 11478.0], [94.1, 11490.0], [94.2, 11532.0], [94.3, 11540.0], [94.4, 11557.0], [94.5, 11573.0], [94.6, 11591.0], [94.7, 11595.0], [94.8, 11611.0], [94.9, 11628.0], [95.0, 11629.0], [95.1, 11667.0], [95.2, 11669.0], [95.3, 11692.0], [95.4, 11728.0], [95.5, 11743.0], [95.6, 11772.0], [95.7, 11804.0], [95.8, 11853.0], [95.9, 11889.0], [96.0, 11997.0], [96.1, 12060.0], [96.2, 12088.0], [96.3, 12118.0], [96.4, 12143.0], [96.5, 12158.0], [96.6, 12187.0], [96.7, 12216.0], [96.8, 12230.0], [96.9, 12235.0], [97.0, 12237.0], [97.1, 12288.0], [97.2, 12314.0], [97.3, 12352.0], [97.4, 12389.0], [97.5, 12449.0], [97.6, 12584.0], [97.7, 12611.0], [97.8, 12671.0], [97.9, 12719.0], [98.0, 12733.0], [98.1, 12745.0], [98.2, 12873.0], [98.3, 12953.0], [98.4, 12985.0], [98.5, 12997.0], [98.6, 13010.0], [98.7, 13078.0], [98.8, 13164.0], [98.9, 13243.0], [99.0, 13306.0], [99.1, 13373.0], [99.2, 13479.0], [99.3, 13591.0], [99.4, 13711.0], [99.5, 13803.0], [99.6, 13882.0], [99.7, 13982.0], [99.8, 14101.0], [99.9, 14163.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 300.0, "maxY": 39.0, "series": [{"data": [[300.0, 5.0], [400.0, 14.0], [500.0, 14.0], [600.0, 16.0], [700.0, 7.0], [800.0, 10.0], [900.0, 1.0], [1000.0, 1.0], [1200.0, 1.0], [1300.0, 1.0], [1400.0, 2.0], [1500.0, 7.0], [1600.0, 8.0], [1700.0, 5.0], [1800.0, 3.0], [1900.0, 4.0], [2000.0, 3.0], [2100.0, 7.0], [2200.0, 5.0], [2300.0, 1.0], [2400.0, 5.0], [2500.0, 9.0], [2600.0, 6.0], [2700.0, 10.0], [2800.0, 4.0], [2900.0, 8.0], [3000.0, 10.0], [3100.0, 13.0], [3200.0, 11.0], [3300.0, 21.0], [3400.0, 9.0], [3500.0, 17.0], [3600.0, 18.0], [3700.0, 22.0], [3800.0, 25.0], [3900.0, 12.0], [4000.0, 22.0], [4100.0, 22.0], [4200.0, 20.0], [4300.0, 14.0], [4600.0, 15.0], [4400.0, 12.0], [4500.0, 13.0], [4700.0, 16.0], [4800.0, 23.0], [4900.0, 20.0], [5100.0, 16.0], [5000.0, 21.0], [5200.0, 19.0], [5300.0, 12.0], [5400.0, 20.0], [5500.0, 25.0], [5600.0, 13.0], [5700.0, 16.0], [5800.0, 20.0], [5900.0, 19.0], [6000.0, 28.0], [6100.0, 29.0], [6200.0, 16.0], [6300.0, 21.0], [6400.0, 29.0], [6500.0, 35.0], [6600.0, 19.0], [6700.0, 21.0], [6800.0, 18.0], [6900.0, 21.0], [7100.0, 24.0], [7000.0, 24.0], [7400.0, 24.0], [7300.0, 33.0], [7200.0, 20.0], [7600.0, 6.0], [7500.0, 10.0], [7700.0, 22.0], [7800.0, 11.0], [7900.0, 17.0], [8000.0, 27.0], [8100.0, 16.0], [8400.0, 23.0], [8500.0, 24.0], [8200.0, 25.0], [8700.0, 19.0], [8300.0, 20.0], [8600.0, 27.0], [8800.0, 17.0], [9000.0, 29.0], [8900.0, 22.0], [9200.0, 22.0], [9100.0, 23.0], [9300.0, 18.0], [9500.0, 23.0], [9700.0, 13.0], [9600.0, 18.0], [9400.0, 20.0], [10100.0, 17.0], [10200.0, 19.0], [9900.0, 12.0], [10000.0, 15.0], [9800.0, 15.0], [10300.0, 29.0], [10700.0, 22.0], [10600.0, 24.0], [10400.0, 39.0], [10500.0, 39.0], [11200.0, 17.0], [10800.0, 36.0], [10900.0, 20.0], [11100.0, 26.0], [11000.0, 23.0], [11300.0, 20.0], [11500.0, 13.0], [11400.0, 23.0], [11700.0, 7.0], [11600.0, 11.0], [12000.0, 5.0], [12100.0, 8.0], [11800.0, 6.0], [12200.0, 9.0], [11900.0, 1.0], [12300.0, 6.0], [12500.0, 2.0], [12700.0, 5.0], [12600.0, 5.0], [12400.0, 2.0], [12800.0, 2.0], [13000.0, 4.0], [13100.0, 2.0], [12900.0, 6.0], [13200.0, 3.0], [13300.0, 3.0], [13500.0, 1.0], [13600.0, 1.0], [13700.0, 2.0], [13400.0, 3.0], [13800.0, 3.0], [13900.0, 3.0], [14100.0, 3.0], [14400.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 14400.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 19.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1928.0, "series": [{"data": [[1.0, 53.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 19.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 1928.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 503.5417495029835, "minX": 1.54961868E12, "maxY": 868.4164989939635, "series": [{"data": [[1.54961874E12, 503.5417495029835], [1.54961868E12, 868.4164989939635]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961874E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 403.0, "minX": 1.0, "maxY": 14448.0, "series": [{"data": [[2.0, 10512.0], [4.0, 11401.0], [5.0, 11316.0], [6.0, 11370.0], [7.0, 11184.0], [8.0, 10812.0], [9.0, 10974.0], [10.0, 10951.0], [11.0, 11410.0], [13.0, 11323.0], [14.0, 11188.5], [15.0, 11133.0], [16.0, 10724.0], [17.0, 11668.0], [18.0, 10544.0], [19.0, 10474.0], [20.0, 11192.0], [21.0, 10919.0], [23.0, 10560.0], [24.0, 11163.0], [26.0, 11087.5], [27.0, 11490.0], [28.0, 10607.0], [29.0, 10569.0], [30.0, 11629.0], [31.0, 11322.0], [33.0, 10660.0], [32.0, 10805.0], [34.0, 11320.0], [37.0, 11210.0], [36.0, 10856.5], [39.0, 11296.0], [38.0, 11743.0], [41.0, 10939.0], [40.0, 10813.0], [43.0, 10569.0], [42.0, 10975.0], [45.0, 10743.0], [44.0, 10706.0], [47.0, 11292.0], [46.0, 11027.0], [49.0, 10582.0], [48.0, 11540.0], [51.0, 10894.0], [50.0, 11667.0], [53.0, 10758.0], [52.0, 10471.0], [55.0, 10430.0], [54.0, 11185.0], [57.0, 10934.0], [56.0, 10793.0], [59.0, 10802.0], [58.0, 11029.0], [61.0, 11079.0], [60.0, 11557.0], [63.0, 11223.0], [62.0, 11040.0], [67.0, 5855.0], [66.0, 10805.0], [65.0, 11028.5], [71.0, 10473.0], [70.0, 11472.0], [69.0, 11669.0], [68.0, 10855.0], [73.0, 3768.0], [72.0, 3178.0], [75.0, 403.0], [74.0, 3852.0], [76.0, 5526.25], [78.0, 438.0], [79.0, 3376.0], [77.0, 3214.75], [80.0, 3930.3333333333335], [82.0, 6724.5], [81.0, 10417.0], [84.0, 7347.333333333333], [87.0, 3886.6666666666665], [86.0, 13010.0], [85.0, 14448.0], [90.0, 5740.5], [91.0, 472.0], [89.0, 10838.0], [88.0, 10439.0], [92.0, 5713.75], [95.0, 11157.0], [94.0, 11680.0], [93.0, 10785.0], [99.0, 10511.0], [98.0, 11462.0], [97.0, 10321.0], [96.0, 10535.0], [103.0, 13485.0], [102.0, 10887.5], [100.0, 10986.0], [104.0, 5601.0], [107.0, 5568.5], [106.0, 11436.0], [105.0, 10455.0], [111.0, 10696.0], [110.0, 11533.0], [108.0, 10304.0], [114.0, 6053.5], [115.0, 5692.5], [113.0, 10516.0], [112.0, 10548.0], [116.0, 3373.25], [117.0, 3074.25], [119.0, 11294.0], [118.0, 10840.0], [121.0, 4232.666666666666], [122.0, 5597.5], [123.0, 10847.0], [120.0, 10350.0], [125.0, 5968.0], [126.0, 6113.5], [127.0, 10436.0], [124.0, 10738.0], [130.0, 5584.0], [131.0, 1784.3], [132.0, 2569.333333333333], [135.0, 5596.5], [134.0, 11293.0], [133.0, 11165.0], [129.0, 10340.0], [128.0, 11296.0], [137.0, 4187.666666666666], [138.0, 3716.0], [143.0, 11470.0], [142.0, 11319.0], [141.0, 11997.0], [140.0, 10430.0], [139.0, 11201.0], [136.0, 10736.0], [151.0, 10848.0], [150.0, 10350.0], [149.0, 10242.0], [148.0, 10541.0], [147.0, 11102.0], [146.0, 11465.0], [145.0, 10542.0], [144.0, 10619.0], [159.0, 10553.0], [158.0, 11406.0], [157.0, 10437.0], [156.0, 10841.0], [155.0, 11420.0], [154.0, 11335.0], [153.0, 11264.0], [152.0, 10813.0], [167.0, 11099.0], [166.0, 10745.0], [165.0, 11139.0], [164.0, 10144.0], [163.0, 10362.0], [162.0, 10245.0], [161.0, 12216.0], [160.0, 10389.0], [175.0, 10846.0], [174.0, 12584.0], [173.0, 10838.0], [172.0, 11440.0], [171.0, 10338.0], [170.0, 10291.0], [169.0, 11611.0], [168.0, 11476.0], [183.0, 10885.0], [182.0, 10495.0], [181.0, 13711.0], [180.0, 10794.0], [179.0, 10807.0], [178.0, 12143.0], [177.0, 11109.0], [176.0, 11453.0], [191.0, 11013.0], [190.0, 10717.0], [189.0, 10379.0], [188.0, 10577.0], [187.0, 10322.0], [186.0, 10731.0], [185.0, 13882.0], [184.0, 10856.0], [199.0, 10970.0], [198.0, 11017.0], [197.0, 10313.0], [196.0, 10479.0], [195.0, 10672.0], [194.0, 11153.0], [193.0, 10296.0], [192.0, 10814.0], [207.0, 10904.0], [206.0, 11168.0], [205.0, 11100.0], [204.0, 12352.0], [203.0, 10555.0], [202.0, 10914.0], [201.0, 11403.0], [200.0, 13223.0], [215.0, 10678.0], [214.0, 13803.0], [213.0, 10561.0], [212.0, 12745.0], [211.0, 11236.0], [210.0, 10553.0], [209.0, 12079.0], [208.0, 14139.0], [223.0, 11101.0], [222.0, 11575.0], [221.0, 10328.0], [220.0, 12992.0], [219.0, 10645.0], [218.0, 10990.0], [217.0, 10327.0], [216.0, 10485.0], [231.0, 11737.5], [229.0, 10230.0], [228.0, 10727.0], [227.0, 10817.0], [226.0, 10860.0], [225.0, 11058.0], [224.0, 11628.0], [239.0, 13840.0], [238.0, 11024.0], [237.0, 10096.0], [236.0, 10424.0], [235.0, 14101.0], [234.0, 11136.0], [233.0, 12953.0], [232.0, 13298.0], [246.0, 6812.5], [247.0, 13401.0], [245.0, 9971.0], [244.0, 10319.0], [243.0, 11010.0], [242.0, 12611.0], [241.0, 12288.0], [240.0, 10585.0], [251.0, 5937.0], [250.0, 6819.5], [252.0, 5306.0], [255.0, 11033.0], [254.0, 10063.0], [253.0, 10231.0], [249.0, 10639.0], [248.0, 10124.0], [269.0, 11169.0], [259.0, 6216.5], [263.0, 9751.0], [256.0, 10879.0], [258.0, 13479.0], [257.0, 11065.0], [260.0, 6067.5], [261.0, 13999.0], [262.0, 5801.0], [266.0, 1532.0], [265.0, 10064.0], [264.0, 10131.0], [271.0, 4602.0], [270.0, 11822.0], [268.0, 11463.0], [267.0, 12392.0], [284.0, 6105.0], [272.0, 5939.5], [273.0, 14163.0], [278.0, 13982.0], [277.0, 9796.0], [276.0, 10854.0], [274.0, 5914.5], [275.0, 5932.5], [280.0, 7346.666666666667], [281.0, 10169.0], [287.0, 12230.0], [286.0, 10500.0], [285.0, 10600.0], [283.0, 13373.0], [282.0, 12235.0], [303.0, 12053.5], [293.0, 7223.5], [292.0, 10833.0], [297.0, 5610.0], [300.0, 6807.5], [301.0, 7709.5], [299.0, 10578.0], [298.0, 10586.0], [296.0, 12734.0], [295.0, 10838.0], [289.0, 10622.0], [288.0, 9839.0], [291.0, 12449.0], [290.0, 13133.0], [294.0, 11628.0], [319.0, 10409.0], [309.0, 7469.0], [308.0, 6543.5], [312.0, 7565.0], [313.0, 13078.0], [318.0, 12984.0], [317.0, 10601.0], [316.0, 13591.0], [307.0, 11030.0], [306.0, 11266.0], [305.0, 10272.0], [304.0, 13650.0], [311.0, 12286.0], [310.0, 13940.0], [315.0, 10361.0], [314.0, 10328.0], [335.0, 10941.0], [320.0, 6967.5], [326.0, 6247.0], [325.0, 12118.0], [324.0, 11069.0], [327.0, 11195.0], [331.0, 6499.5], [334.0, 11894.0], [333.0, 11288.0], [332.0, 9260.0], [323.0, 12187.0], [322.0, 10747.0], [321.0, 11772.0], [330.0, 12873.0], [329.0, 10980.0], [328.0, 12671.0], [350.0, 5970.5], [341.0, 2141.0], [340.0, 6610.5], [347.0, 7562.5], [349.0, 11324.0], [348.0, 9364.0], [343.0, 12154.0], [339.0, 10757.0], [338.0, 9583.0], [337.0, 12092.0], [336.0, 13164.0], [342.0, 11112.5], [346.0, 11181.0], [345.0, 12389.0], [344.0, 11120.0], [367.0, 11095.0], [355.0, 4852.0], [358.0, 11355.0], [352.0, 10224.5], [354.0, 10004.0], [353.0, 11198.0], [357.0, 11889.0], [356.0, 9258.0], [362.0, 7418.5], [366.0, 10392.0], [365.0, 11480.0], [364.0, 12188.0], [363.0, 12719.0], [361.0, 10153.0], [360.0, 11515.5], [382.0, 12314.0], [383.0, 10823.0], [381.0, 12725.0], [380.0, 12225.0], [379.0, 10966.0], [378.0, 10672.0], [377.0, 12659.0], [376.0, 10459.0], [375.0, 12235.0], [369.0, 10568.0], [368.0, 11704.0], [371.0, 10780.0], [370.0, 10521.0], [374.0, 12325.0], [373.0, 11469.0], [372.0, 9860.0], [397.0, 6363.5], [385.0, 6761.0], [387.0, 5588.5], [386.0, 11267.0], [391.0, 4432.0], [384.0, 10293.0], [392.0, 6112.0], [393.0, 11730.0], [395.0, 12237.0], [394.0, 9973.0], [390.0, 6946.0], [389.0, 9626.0], [388.0, 9968.0], [399.0, 10757.0], [398.0, 12525.0], [396.0, 10622.0], [415.0, 11378.0], [410.0, 5694.0], [414.0, 11403.0], [413.0, 11728.0], [412.0, 8904.0], [403.0, 9628.0], [402.0, 12311.0], [401.0, 10829.0], [400.0, 11613.0], [411.0, 9486.0], [409.0, 10005.0], [408.0, 10376.0], [407.0, 9891.0], [406.0, 11865.0], [405.0, 11094.0], [404.0, 9542.0], [430.0, 9479.0], [429.0, 6022.5], [431.0, 11026.0], [428.0, 9808.5], [426.0, 10842.0], [425.0, 9534.0], [424.0, 10578.0], [423.0, 10854.0], [417.0, 10727.0], [416.0, 11041.0], [419.0, 9668.0], [418.0, 10433.0], [422.0, 11198.0], [421.0, 10748.0], [420.0, 9780.0], [435.0, 5510.666666666666], [434.0, 5910.0], [433.0, 11076.0], [432.0, 10277.0], [443.0, 7852.333333333333], [446.0, 10004.0], [445.0, 9578.0], [444.0, 11570.0], [441.0, 12158.0], [440.0, 9487.0], [439.0, 12388.0], [438.0, 11394.0], [437.0, 10701.0], [436.0, 11193.0], [462.0, 11287.0], [460.0, 6824.5], [463.0, 10085.0], [461.0, 10416.0], [459.0, 9379.0], [458.0, 10257.0], [457.0, 11193.0], [456.0, 9369.0], [455.0, 11750.0], [449.0, 10871.0], [448.0, 11437.5], [451.0, 9877.0], [450.0, 9980.0], [454.0, 9165.0], [453.0, 10504.0], [452.0, 9806.0], [478.0, 4782.333333333334], [469.0, 5350.0], [468.0, 6529.5], [479.0, 6045.0], [477.0, 9395.0], [476.0, 9003.0], [471.0, 9833.5], [465.0, 9144.0], [464.0, 11136.0], [467.0, 9519.0], [466.0, 10469.0], [475.0, 9211.0], [474.0, 9007.0], [473.0, 11478.0], [472.0, 9437.0], [494.0, 6515.5], [480.0, 6528.5], [482.0, 10835.0], [481.0, 9246.0], [487.0, 10635.0], [486.0, 12060.0], [485.0, 9266.0], [484.0, 9636.0], [483.0, 5807.0], [492.0, 6290.5], [495.0, 6723.0], [493.0, 9815.0], [491.0, 9365.0], [490.0, 10339.0], [489.0, 9686.0], [488.0, 11525.0], [510.0, 9466.0], [500.0, 7130.5], [502.0, 9112.0], [501.0, 10584.0], [503.0, 6533.5], [509.0, 5903.5], [511.0, 6486.5], [508.0, 10471.0], [499.0, 9071.0], [498.0, 8856.0], [497.0, 10619.0], [496.0, 8831.0], [507.0, 9597.0], [506.0, 10550.0], [505.0, 10966.0], [504.0, 9233.0], [540.0, 8903.0], [513.0, 5780.0], [519.0, 6120.0], [518.0, 9177.0], [517.0, 9822.0], [516.0, 10550.0], [515.0, 10288.0], [514.0, 8626.0], [536.0, 10549.0], [538.0, 11279.0], [537.0, 9024.0], [541.0, 9449.0], [543.0, 5731.5], [542.0, 9510.0], [520.0, 5705.0], [521.0, 5842.0], [522.0, 6095.0], [523.0, 10561.0], [525.0, 9704.0], [524.0, 10235.0], [526.0, 6603.0], [527.0, 8851.0], [512.0, 9818.0], [528.0, 7006.0], [529.0, 6456.5], [530.0, 6002.0], [532.0, 6758.5], [531.0, 10310.0], [533.0, 10278.0], [534.0, 7020.0], [535.0, 10228.0], [568.0, 4839.333333333333], [574.0, 6095.0], [544.0, 5824.0], [545.0, 10110.0], [547.0, 9173.0], [546.0, 8507.0], [549.0, 9052.0], [548.0, 10448.0], [551.0, 9315.0], [550.0, 9866.0], [559.0, 8878.0], [558.0, 10476.0], [557.0, 8949.0], [556.0, 9423.0], [555.0, 8829.0], [554.0, 9730.0], [553.0, 8626.0], [552.0, 9337.0], [561.0, 6908.0], [565.0, 5181.333333333333], [564.0, 8967.0], [563.0, 10217.0], [562.0, 8569.0], [567.0, 9655.0], [566.0, 10493.0], [569.0, 5896.5], [571.0, 8774.0], [570.0, 9822.0], [575.0, 4852.0], [560.0, 10374.0], [573.0, 8956.0], [572.0, 10489.0], [603.0, 6383.5], [576.0, 5726.0], [579.0, 6819.5], [578.0, 9472.0], [577.0, 10316.0], [580.0, 9998.0], [582.0, 9205.0], [581.0, 9017.0], [600.0, 9432.0], [583.0, 9191.0], [591.0, 5825.0], [590.0, 8326.0], [589.0, 9788.5], [587.0, 8309.0], [586.0, 9783.0], [585.0, 8278.0], [584.0, 9119.0], [597.0, 6488.0], [596.0, 8179.0], [595.0, 8549.0], [594.0, 8739.0], [593.0, 9429.0], [592.0, 8563.0], [599.0, 9775.0], [598.0, 8768.0], [602.0, 5896.0], [601.0, 10164.0], [605.0, 6291.5], [604.0, 10043.0], [607.0, 8592.0], [606.0, 9908.0], [635.0, 8668.0], [623.0, 4902.666666666667], [622.0, 8064.0], [621.0, 8355.0], [620.0, 10357.0], [619.0, 9047.0], [618.0, 8958.0], [617.0, 8813.0], [616.0, 8451.0], [637.0, 5395.5], [639.0, 8303.0], [631.0, 9676.0], [630.0, 9498.0], [629.0, 8960.0], [628.0, 9444.0], [627.0, 8956.0], [626.0, 9308.0], [625.0, 8657.0], [624.0, 8079.0], [638.0, 9521.0], [636.0, 8415.0], [634.0, 9052.0], [633.0, 9582.0], [632.0, 7840.0], [615.0, 8299.0], [614.0, 9983.0], [613.0, 7972.0], [612.0, 10184.0], [611.0, 7935.0], [610.0, 7881.0], [609.0, 8079.0], [608.0, 9532.0], [667.0, 5063.333333333333], [643.0, 4422.6], [641.0, 3970.75], [640.0, 9045.0], [642.0, 8435.0], [647.0, 6126.0], [646.0, 7361.0], [645.0, 9207.0], [644.0, 8258.0], [658.0, 6295.5], [671.0, 9086.0], [656.0, 9694.0], [657.0, 9384.0], [670.0, 4842.0], [669.0, 5706.0], [668.0, 8595.0], [665.0, 4898.0], [666.0, 4652.0], [664.0, 6035.5], [648.0, 6697.5], [650.0, 8227.0], [649.0, 7468.0], [652.0, 9189.0], [651.0, 7827.0], [653.0, 6086.0], [654.0, 5570.5], [655.0, 6642.0], [659.0, 5054.0], [660.0, 4672.666666666667], [661.0, 8391.0], [663.0, 8733.0], [662.0, 7327.0], [699.0, 5100.5], [677.0, 5801.0], [674.0, 5746.333333333333], [673.0, 6086.0], [672.0, 8301.0], [687.0, 9026.0], [686.0, 8865.0], [685.0, 7221.0], [684.0, 9044.0], [683.0, 7786.0], [676.0, 4180.8], [675.0, 7435.0], [678.0, 5718.0], [679.0, 6790.5], [680.0, 5752.333333333333], [681.0, 7114.0], [682.0, 6855.0], [689.0, 4979.666666666667], [696.0, 6441.0], [698.0, 8957.0], [697.0, 9176.0], [700.0, 5695.0], [701.0, 5672.0], [702.0, 5438.5], [703.0, 9204.0], [688.0, 7381.0], [690.0, 5935.0], [691.0, 7384.0], [693.0, 9977.0], [692.0, 8631.0], [695.0, 7429.0], [694.0, 8425.0], [706.0, 5432.25], [707.0, 5869.0], [708.0, 8049.0], [710.0, 9280.0], [709.0, 8020.0], [712.0, 6232.25], [711.0, 3974.0], [713.0, 5319.666666666667], [715.0, 4173.5], [714.0, 5890.5], [717.0, 6316.0], [716.0, 9631.0], [719.0, 9678.0], [705.0, 7105.0], [704.0, 7609.0], [718.0, 9745.0], [720.0, 5754.5], [721.0, 8695.0], [735.0, 9521.0], [733.0, 6239.5], [732.0, 7945.0], [734.0, 5741.5], [728.0, 6883.0], [730.0, 7151.5], [729.0, 7201.0], [731.0, 6730.5], [723.0, 5314.333333333333], [724.0, 5783.75], [727.0, 5172.5], [726.0, 8646.0], [725.0, 11337.0], [722.0, 3735.25], [764.0, 7334.0], [739.0, 7338.666666666667], [736.0, 4744.4], [751.0, 9659.0], [750.0, 9540.5], [748.0, 9468.0], [747.0, 8415.0], [746.0, 9557.0], [745.0, 7550.0], [744.0, 9049.0], [737.0, 5381.666666666667], [738.0, 4322.0], [760.0, 5733.0], [743.0, 8285.0], [742.0, 9299.0], [741.0, 9275.0], [740.0, 7837.0], [762.0, 6370.5], [763.0, 6812.0], [765.0, 5148.0], [761.0, 6136.0], [767.0, 5014.75], [753.0, 8751.0], [752.0, 9460.0], [755.0, 9601.0], [754.0, 9336.0], [757.0, 8629.0], [756.0, 7265.0], [759.0, 8403.0], [758.0, 9188.0], [766.0, 4246.0], [772.0, 5736.666666666667], [783.0, 4630.5], [769.0, 6232.5], [768.0, 6179.5], [770.0, 5598.333333333333], [771.0, 6905.0], [776.0, 7533.0], [775.0, 4969.0], [774.0, 8929.0], [773.0, 8958.0], [792.0, 8793.0], [793.0, 4770.25], [796.0, 5067.5], [797.0, 6183.0], [798.0, 6083.0], [799.0, 8597.0], [784.0, 8514.0], [795.0, 5968.0], [794.0, 6187.0], [785.0, 6355.5], [788.0, 4846.0], [787.0, 7330.0], [786.0, 9263.0], [789.0, 10720.0], [791.0, 6367.5], [790.0, 8297.0], [778.0, 6906.0], [777.0, 6899.5], [782.0, 5113.333333333333], [780.0, 5128.666666666667], [779.0, 7007.0], [781.0, 5659.333333333333], [827.0, 5118.8], [812.0, 7407.666666666667], [800.0, 6038.5], [807.0, 6395.0], [806.0, 8685.0], [805.0, 9073.0], [804.0, 8761.0], [803.0, 9178.0], [802.0, 9262.0], [801.0, 8857.0], [824.0, 8381.0], [826.0, 8084.0], [825.0, 9243.0], [828.0, 4931.285714285714], [829.0, 4611.777777777777], [830.0, 4757.0], [831.0, 5560.5], [808.0, 4616.142857142858], [809.0, 3938.0], [811.0, 3864.0], [810.0, 8343.5], [814.0, 6081.0], [813.0, 7923.0], [815.0, 5384.5], [816.0, 6228.5], [818.0, 6950.5], [822.0, 6576.0], [821.0, 8869.0], [820.0, 8519.0], [819.0, 7590.0], [823.0, 7255.0], [817.0, 5399.5], [834.0, 6080.5], [833.0, 6353.5], [847.0, 9014.0], [832.0, 9950.0], [846.0, 5424.333333333334], [845.0, 5841.5], [844.0, 9058.0], [836.0, 6476.0], [835.0, 10071.0], [838.0, 4635.777777777777], [839.0, 4808.000000000001], [857.0, 7948.0], [856.0, 8489.0], [858.0, 4964.0], [859.0, 4827.066666666667], [860.0, 4796.5], [863.0, 4993.8], [862.0, 6190.0], [861.0, 6003.75], [848.0, 6486.5], [851.0, 6822.0], [850.0, 8509.0], [849.0, 7919.0], [852.0, 6636.0], [855.0, 7153.333333333333], [853.0, 7952.0], [837.0, 4968.0], [840.0, 6061.4], [841.0, 4862.4], [843.0, 6695.0], [842.0, 5103.5], [871.0, 5240.8], [865.0, 6537.0], [864.0, 7462.0], [877.0, 6306.5], [876.0, 7767.0], [878.0, 8942.0], [879.0, 6052.0], [868.0, 5872.0], [867.0, 8773.0], [866.0, 5855.0], [869.0, 5706.6], [880.0, 5267.0], [895.0, 8406.0], [894.0, 7493.0], [893.0, 8013.0], [892.0, 9796.0], [891.0, 7596.0], [890.0, 6700.0], [889.0, 9686.0], [888.0, 8640.0], [881.0, 6038.0], [885.0, 6165.0], [883.0, 8836.0], [882.0, 7769.0], [887.0, 5643.5], [886.0, 6643.0], [870.0, 5013.8], [872.0, 5751.75], [875.0, 6322.666666666667], [874.0, 5940.666666666667], [873.0, 9630.0], [921.0, 9164.0], [926.0, 8631.5], [927.0, 8622.0], [914.0, 8198.0], [913.0, 9218.0], [916.0, 8716.0], [915.0, 8612.0], [924.0, 8648.0], [923.0, 8752.0], [922.0, 8087.0], [920.0, 7484.0], [903.0, 8275.0], [902.0, 8718.0], [901.0, 9063.0], [900.0, 7359.0], [899.0, 7124.0], [898.0, 8405.0], [897.0, 8307.0], [896.0, 7294.0], [911.0, 8321.0], [910.0, 10143.0], [909.0, 8144.0], [908.0, 8361.5], [906.0, 8062.0], [905.0, 8629.0], [904.0, 7723.0], [919.0, 8218.0], [917.0, 9562.0], [956.0, 8194.0], [959.0, 7381.0], [945.0, 7199.0], [944.0, 8033.0], [947.0, 7241.0], [946.0, 7084.0], [949.0, 7596.0], [948.0, 7249.0], [958.0, 8448.0], [957.0, 8260.0], [955.0, 8187.0], [954.0, 6655.0], [953.0, 8202.0], [952.0, 8036.0], [942.0, 7172.0], [929.0, 8150.0], [928.0, 8292.0], [931.0, 8643.0], [930.0, 10335.0], [933.0, 5408.0], [932.0, 8000.0], [935.0, 8711.0], [934.0, 7309.0], [941.0, 8694.0], [940.0, 8596.0], [939.0, 7397.0], [938.0, 7834.0], [937.0, 8241.0], [936.0, 8152.0], [951.0, 7712.0], [950.0, 7451.0], [985.0, 6363.5], [990.0, 6086.4], [991.0, 5545.8], [977.0, 7080.0], [976.0, 7916.5], [978.0, 5483.0], [979.0, 5618.2], [981.0, 5640.4], [980.0, 6001.857142857143], [989.0, 5721.4], [988.0, 7040.0], [987.0, 7792.5], [986.0, 7008.0], [984.0, 5529.5], [967.0, 6618.0], [966.0, 7253.0], [965.0, 7136.0], [964.0, 7139.0], [963.0, 7617.0], [962.0, 7113.0], [961.0, 8355.0], [960.0, 7215.0], [974.0, 8067.0], [973.0, 7890.0], [972.0, 8443.0], [971.0, 6728.0], [970.0, 7497.0], [969.0, 7731.0], [968.0, 8233.0], [983.0, 5746.428571428571], [982.0, 6160.0], [996.0, 5675.6], [1004.0, 6503.0], [1005.0, 5817.0], [1006.0, 5947.2], [1007.0, 5501.8], [993.0, 5933.0], [992.0, 6433.666666666667], [995.0, 6232.333333333333], [994.0, 5694.25], [1003.0, 6744.0], [1002.0, 6072.0], [1001.0, 6582.0], [1000.0, 6149.25], [999.0, 5854.0], [1016.0, 5691.666666666667], [1018.0, 5939.666666666667], [1017.0, 7417.0], [1019.0, 6178.0], [1020.0, 5860.0], [1021.0, 6277.5], [1022.0, 6709.75], [1023.0, 8829.0], [1008.0, 7352.0], [1011.0, 6173.0], [1010.0, 8187.0], [1009.0, 7302.0], [1012.0, 6016.5], [1015.0, 6583.0], [1014.0, 6991.0], [1013.0, 6676.0], [998.0, 5984.0], [997.0, 5764.75], [1030.0, 6050.5], [1028.0, 6477.5], [1026.0, 5451.0], [1024.0, 6592.0], [1054.0, 8175.0], [1052.0, 8713.0], [1046.0, 6571.0], [1048.0, 7404.0], [1050.0, 5340.0], [1032.0, 5860.0], [1036.0, 6968.0], [1034.0, 6788.0], [1056.0, 6049.666666666667], [1086.0, 6502.0], [1082.0, 5742.0], [1084.0, 5853.0], [1080.0, 7608.5], [1076.0, 6518.0], [1074.0, 7603.0], [1078.0, 5517.0], [1060.0, 6512.0], [1058.0, 7385.0], [1062.0, 7265.0], [1068.0, 7243.0], [1066.0, 7434.0], [1064.0, 6182.0], [1070.0, 6983.0], [1042.0, 6607.5], [1040.0, 7148.0], [1044.0, 6518.0], [1092.0, 6233.0], [1088.0, 6927.0], [1114.0, 5936.0], [1116.0, 6137.0], [1118.0, 6590.0], [1108.0, 6012.0], [1106.0, 6029.0], [1104.0, 6093.0], [1110.0, 6155.0], [1112.0, 6862.666666666667], [1090.0, 6410.0], [1094.0, 6325.0], [1096.0, 6368.2], [1098.0, 6233.666666666667], [1100.0, 6360.0], [1122.0, 6781.0], [1120.0, 7481.0], [1148.0, 7132.0], [1146.0, 6331.0], [1150.0, 7000.0], [1140.0, 7810.0], [1142.0, 6612.0], [1144.0, 5421.0], [1136.0, 7480.0], [1102.0, 7219.0], [1138.0, 5722.5], [1124.0, 6418.0], [1126.0, 6099.5], [1130.0, 6226.166666666667], [1134.0, 7349.0], [1132.0, 7321.0], [1128.0, 6614.0], [1156.0, 5846.666666666667], [1152.0, 6352.0], [1182.0, 6349.4], [1180.0, 7587.0], [1178.0, 6433.0], [1176.0, 6066.0], [1174.0, 6399.0], [1172.0, 7072.0], [1170.0, 6289.0], [1168.0, 6488.5], [1154.0, 5998.0], [1158.0, 6671.0], [1162.0, 5638.333333333333], [1164.0, 6560.0], [1166.0, 6178.0], [1200.0, 6836.5], [1202.0, 5454.0], [1204.0, 6676.5], [1208.0, 6502.0], [1206.0, 5579.0], [1210.0, 6249.75], [1212.0, 6388.0], [1184.0, 6537.0], [1186.0, 5755.0], [1214.0, 6489.0], [1188.0, 6807.0], [1190.0, 5515.0], [1192.0, 6559.666666666667], [1198.0, 6317.0], [1196.0, 6675.0], [1194.0, 5955.0], [1218.0, 6840.666666666667], [1216.0, 5904.0], [1232.0, 6100.333333333333], [1234.0, 6808.5], [1222.0, 6702.5], [1220.0, 6647.0], [1226.0, 6571.5], [1224.0, 6574.0], [1230.0, 6035.0], [1228.0, 6984.0], [1031.0, 6895.0], [1039.0, 6460.75], [1025.0, 7745.0], [1027.0, 6903.5], [1055.0, 7070.0], [1051.0, 6160.5], [1053.0, 5663.5], [1047.0, 6491.0], [1049.0, 5646.333333333333], [1029.0, 7256.0], [1033.0, 5989.666666666667], [1037.0, 5968.0], [1035.0, 7726.0], [1087.0, 7018.5], [1085.0, 5681.5], [1083.0, 6723.0], [1079.0, 7037.0], [1081.0, 5800.0], [1075.0, 6948.0], [1073.0, 7523.0], [1077.0, 7337.0], [1057.0, 6421.666666666667], [1061.0, 6385.0], [1059.0, 6704.0], [1063.0, 6245.0], [1069.0, 6140.333333333333], [1067.0, 6416.0], [1065.0, 7050.0], [1071.0, 7081.0], [1041.0, 7942.0], [1045.0, 6489.0], [1043.0, 7345.0], [1093.0, 6175.8], [1097.0, 5871.5], [1119.0, 6349.0], [1113.0, 6980.0], [1115.0, 6046.0], [1117.0, 8008.0], [1107.0, 6605.0], [1105.0, 6549.0], [1111.0, 8244.0], [1109.0, 6793.5], [1089.0, 6976.0], [1091.0, 7370.0], [1095.0, 6454.0], [1099.0, 6189.0], [1101.0, 5807.0], [1123.0, 6001.5], [1121.0, 6414.0], [1149.0, 6650.5], [1147.0, 5961.0], [1145.0, 7112.0], [1151.0, 6987.0], [1141.0, 6433.5], [1139.0, 6518.0], [1143.0, 7027.0], [1137.0, 7529.5], [1103.0, 7191.0], [1129.0, 6226.75], [1131.0, 6617.0], [1135.0, 6571.0], [1133.0, 6862.0], [1127.0, 6329.0], [1125.0, 6464.5], [1153.0, 5741.333333333333], [1181.0, 7063.0], [1179.0, 5817.0], [1183.0, 6447.25], [1177.0, 6104.5], [1175.0, 6725.0], [1173.0, 5798.0], [1171.0, 5343.5], [1169.0, 6204.333333333333], [1155.0, 5720.0], [1157.0, 6908.5], [1159.0, 7280.5], [1161.0, 6313.666666666667], [1165.0, 5820.0], [1167.0, 5935.0], [1203.0, 6395.0], [1201.0, 6689.0], [1209.0, 6077.25], [1207.0, 6236.0], [1205.0, 5879.0], [1211.0, 5841.0], [1213.0, 7044.0], [1215.0, 6111.0], [1185.0, 6491.0], [1187.0, 7611.5], [1189.0, 5783.0], [1191.0, 6483.0], [1199.0, 6115.25], [1197.0, 6773.0], [1195.0, 6347.0], [1193.0, 7360.0], [1163.0, 6436.5], [1221.0, 6675.571428571428], [1217.0, 6934.5], [1235.0, 5948.0], [1233.0, 6661.0], [1219.0, 6876.0], [1223.0, 6156.6], [1225.0, 6634.0], [1227.0, 6234.5], [1229.0, 7060.0], [1231.0, 6390.0], [1.0, 11065.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[684.8844999999993, 7330.915499999999]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1235.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 6245.633333333333, "minX": 1.54961868E12, "maxY": 7058.383333333333, "series": [{"data": [[1.54961874E12, 7058.383333333333], [1.54961868E12, 6973.25]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54961874E12, 6321.033333333334], [1.54961868E12, 6245.633333333333]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961874E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 4805.4235412474845, "minX": 1.54961868E12, "maxY": 9826.282306163015, "series": [{"data": [[1.54961874E12, 9826.282306163015], [1.54961868E12, 4805.4235412474845]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961874E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 4805.408450704227, "minX": 1.54961868E12, "maxY": 9826.276341948302, "series": [{"data": [[1.54961874E12, 9826.276341948302], [1.54961868E12, 4805.408450704227]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961874E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 52.87625754527164, "minX": 1.54961868E12, "maxY": 75.81312127236595, "series": [{"data": [[1.54961874E12, 75.81312127236595], [1.54961868E12, 52.87625754527164]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961874E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 355.0, "minX": 1.54961868E12, "maxY": 14448.0, "series": [{"data": [[1.54961874E12, 14448.0], [1.54961868E12, 8829.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54961874E12, 5408.0], [1.54961868E12, 355.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54961874E12, 11108.300000000001], [1.54961868E12, 7040.5]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54961874E12, 13305.92], [1.54961868E12, 8175.599999999999]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54961874E12, 11628.95], [1.54961868E12, 7389.5]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961874E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 7365.5, "minX": 16.0, "maxY": 7365.5, "series": [{"data": [[16.0, 7365.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 7365.5, "minX": 16.0, "maxY": 7365.5, "series": [{"data": [[16.0, 7365.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54961868E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54961868E12, 33.333333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961868E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 16.566666666666666, "minX": 1.54961868E12, "maxY": 16.766666666666666, "series": [{"data": [[1.54961874E12, 16.766666666666666], [1.54961868E12, 16.566666666666666]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961874E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 16.566666666666666, "minX": 1.54961868E12, "maxY": 16.766666666666666, "series": [{"data": [[1.54961874E12, 16.766666666666666], [1.54961868E12, 16.566666666666666]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961874E12, "title": "Transactions Per Second"}},
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
